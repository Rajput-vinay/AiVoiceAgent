import * as vscode from "vscode";
import { Analyzer, API_KEY_SECRET } from "./analyzer";
import { BuddyPanel } from "./buddyPanel";
import { BuddyView, BuddyViewMessage } from "./buddyView";
import { collectContext } from "./contextCollector";
import { Conversation } from "./conversation";
import { DiagnosticsWatcher } from "./diagnosticsWatcher";
import { TerminalWatcher } from "./terminalWatcher";
import { Analysis, DetectedIssue } from "./types";

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel("AI Buddy");
  const panel = new BuddyPanel();
  const buddyView = new BuddyView(log);
  const analyzer = new Analyzer(context.secrets, log);
  const conversation = new Conversation(context.secrets, log);
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
    buddyView.reply({ spoken: text });
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

    buddyView.issue(issue);
    buddyView.status("🤔 Analyzing the issue...");
    panel.show(issue, { kind: "loading" });
    try {
      const analysis = await analyzer.analyze(issue);
      cache.set(issue.id, analysis);
      if (latestId === issue.id) {
        conversation.setActive(issue, analysis);
        panel.show(issue, { kind: "analysis", analysis });
        buddyView.issue(issue, analysis);
        buddyView.status("Found the cause. Ask me anything about it.");
        speakIfEnabled(analysis.spoken);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.appendLine(`[error] ${message}`);
      if (latestId === issue.id) { panel.show(issue, { kind: "error", message }); buddyView.error(message); buddyView.status("Ready."); }
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

  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  status.text = "$(hubot) AI Buddy";
  status.tooltip = "Open AI Buddy sidebar";
  status.command = "buddy.openPanel";
  status.show();

  context.subscriptions.push(
    diagnostics,
    terminal,
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

    vscode.commands.registerCommand("buddy.openPanel", () => { buddyView.focus(); panel.show(); }),

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

    buddyView.onMessage = async (message: BuddyViewMessage) => {
      try {
        if (message.type === "clear") {
          conversation.clear();
          buddyView.status("Conversation cleared. Ready.");
          return;
        }

        if (message.type === "verify") {
          buddyView.status("🔎 Checking the current diagnostics...");
          const reply = await conversation.verifyFix();
          buddyView.reply(reply);
          return;
        }

        if (message.type === "ask") {
          buddyView.status("🔎 Reading current code and diagnostics...");
          const reply = await conversation.ask(message.text);
          buddyView.reply(reply);
        }
      } catch (err) {
        const messageText = err instanceof Error ? err.message : String(err);
        log.appendLine(`[buddy-view] ${messageText}`);
        buddyView.error(messageText);
        buddyView.status("Ready.");
      }
    };

  log.appendLine("AI Buddy active.");
}

export function deactivate() {}
