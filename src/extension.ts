import * as vscode from "vscode";
import { Analyzer, API_KEY_SECRET } from "./analyzer";
import { BuddyPanel } from "./buddyPanel";
import { collectContext } from "./contextCollector";
import { Conversation } from "./conversation";
import { DiagnosticsWatcher } from "./diagnosticsWatcher";
import { TerminalWatcher } from "./terminalWatcher";
import { Analysis, DetectedIssue } from "./types";
import { VoiceServer } from "./voiceServer";

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel("AI Buddy");
  const panel = new BuddyPanel();
  const analyzer = new Analyzer(context.secrets, log);
  const conversation = new Conversation(context.secrets, log);
  const voice = new VoiceServer((text) => conversation.ask(text), log);
  const diagnostics = new DiagnosticsWatcher();
  const terminal = new TerminalWatcher();

  const cache = new Map<string, Analysis>();
  let latestId = ""; // guards against a slow response overwriting a newer issue

  const pick = (hinglish: string, english: string) =>
    vscode.workspace
      .getConfiguration("buddy")
      .get<string>("language", "hinglish") === "english"
      ? english
      : hinglish;

  function speakIfEnabled(text: string) {
    if (!vscode.workspace.getConfiguration("buddy").get<boolean>("speak", true))
      return;
    if (!voice.speak(text))
      log.appendLine("[voice] no voice page open, skipped speaking");
  }

  async function analyzeAndShow(issue: DetectedIssue) {
    latestId = issue.id;
    conversation.setActive(issue);

    const cached = cache.get(issue.id);
    if (cached) {
      conversation.setActive(issue, cached);
      panel.show(issue, { kind: "analysis", analysis: cached });
      return speakIfEnabled(cached.spoken);
    }

    panel.show(issue, { kind: "loading" });
    try {
      const analysis = await analyzer.analyze(issue);
      cache.set(issue.id, analysis);
      if (latestId === issue.id) {
        conversation.setActive(issue, analysis);
        panel.show(issue, { kind: "analysis", analysis });
        speakIfEnabled(analysis.spoken);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.appendLine(`[error] ${message}`);
      if (latestId === issue.id) panel.show(issue, { kind: "error", message });
    }
  }

  const handleIssue = async (issue: DetectedIssue) => {
    log.appendLine(
      `[${issue.severity}] ${issue.file ?? "terminal"}:${issue.line ?? ""} ${issue.title}`,
    );
    const mode = vscode.workspace
      .getConfiguration("buddy")
      .get<string>("mode", "ask");
    if (mode === "manual") return;
    if (mode === "automatic") return analyzeAndShow(issue);

    // "ask" mode: nothing is sent to the AI until you say yes.
    const choice = await vscode.window.showInformationMessage(
      `Buddy: ${issue.severity} mila: ${issue.title.slice(0, 80)}`,
      "Dekho",
      "Ignore",
    );
    if (choice === "Dekho") analyzeAndShow(issue);
  };

  async function openVoice() {
    try {
      const local = await voice.start();
      // asExternalUri makes this work in Remote/WSL too (port forwarding).
      const external = await vscode.env.asExternalUri(vscode.Uri.parse(local));
      await vscode.env.openExternal(external);
    } catch (err) {
      vscode.window.showErrorMessage(
        `Buddy voice start nahi hua: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  status.text = "$(unmute) Buddy Voice";
  status.tooltip = "Open Buddy Voice in your browser";
  status.command = "buddy.openVoice";
  status.show();

  context.subscriptions.push(
    diagnostics,
    terminal,
    voice,
    status,
    log,
    diagnostics.onIssue(handleIssue),
    terminal.onIssue(handleIssue),
    diagnostics.onResolved((issue) => {
      log.appendLine(`[resolved] ${issue.title}`);
      panel.show(issue, { kind: "fixed" });
      speakIfEnabled(
        pick(
          "Bhai, wo issue ab nahi dikh raha. Fix ho gaya.",
          "That issue is gone now. Looks fixed.",
        ),
      );
    }),

    vscode.commands.registerCommand("buddy.openPanel", () => panel.show()),
    vscode.commands.registerCommand("buddy.openVoice", openVoice),

    vscode.commands.registerCommand("buddy.setApiKey", async () => {
      const key = await vscode.window.showInputBox({
        prompt: "Google Gemini API key (from aistudio.google.com)",
        password: true,
        ignoreFocusOut: true,
      });
      if (!key) return;
      await context.secrets.store(API_KEY_SECRET, key.trim());
      vscode.window.showInformationMessage(
        "Buddy: API key save ho gayi (VS Code SecretStorage me).",
      );
    }),

    vscode.commands.registerCommand("buddy.checkCurrentFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor)
        return vscode.window.showWarningMessage(
          "Buddy: koi file open nahi hai.",
        );
      const uri = editor.document.uri;
      const diags = vscode.languages
        .getDiagnostics(uri)
        .filter((d) => d.severity <= vscode.DiagnosticSeverity.Warning)
        .sort((a, b) => a.severity - b.severity);
      if (diags.length === 0) return panel.show();

      // Prefer the diagnostic nearest the cursor among the most severe ones.
      const cursor = editor.selection.active.line;
      const topSeverity = diags[0].severity;
      const d = diags
        .filter((x) => x.severity === topSeverity)
        .sort(
          (a, b) =>
            Math.abs(a.range.start.line - cursor) -
            Math.abs(b.range.start.line - cursor),
        )[0];

      const ctx = await collectContext(uri, d.range.start.line + 1);
      const code =
        typeof d.code === "object"
          ? String(d.code.value)
          : d.code !== undefined
            ? String(d.code)
            : undefined;
      analyzeAndShow({
        id: `${uri.toString()}:${d.range.start.line}:${code ?? ""}:${d.message}`,
        severity:
          d.severity === vscode.DiagnosticSeverity.Error ? "error" : "warning",
        source: "diagnostic",
        title: d.message.split("\n")[0],
        message: d.message,
        code,
        file: vscode.workspace.asRelativePath(uri),
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        context: ctx,
      });
    }),
  );

  log.appendLine("AI Buddy active.");
}

export function deactivate() {}
