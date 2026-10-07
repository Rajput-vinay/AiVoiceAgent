import * as vscode from "vscode";
import { collectContext } from "./contextCollector";
import { DetectedIssue, Severity } from "./types";

export class DiagnosticsWatcher implements vscode.Disposable {
  private timers = new Map<string, NodeJS.Timeout>();
  private reported = new Map<string, Map<string, DetectedIssue>>(); // uri -> (id -> issue)
  private disposables: vscode.Disposable[] = [];

  private readonly issueEmitter = new vscode.EventEmitter<DetectedIssue>();
  private readonly resolvedEmitter = new vscode.EventEmitter<DetectedIssue>();
  readonly onIssue = this.issueEmitter.event;
  readonly onResolved = this.resolvedEmitter.event;

  constructor() {
    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics((e) =>
        e.uris.forEach((u) => this.schedule(u)),
      ),
      // Every keystroke restarts the timer, so we only react once you pause.
      vscode.workspace.onDidChangeTextDocument((e) =>
        this.schedule(e.document.uri),
      ),
    );
  }

  private schedule(uri: vscode.Uri) {
    if (uri.scheme !== "file" || uri.fsPath.includes("node_modules")) return;
    const key = uri.toString();
    clearTimeout(this.timers.get(key));
    const settleMs = vscode.workspace
      .getConfiguration("buddy")
      .get<number>("settleMs", 2500);
    this.timers.set(
      key,
      setTimeout(() => this.evaluate(uri), settleMs),
    );
  }

  private async evaluate(uri: vscode.Uri) {
    const key = uri.toString();
    const current = vscode.languages
      .getDiagnostics(uri)
      .filter(
        (d) =>
          d.severity === vscode.DiagnosticSeverity.Error ||
          d.severity === vscode.DiagnosticSeverity.Warning,
      );

    const previous = this.reported.get(key) ?? new Map<string, DetectedIssue>();
    const next = new Map<string, DetectedIssue>();

    // Errors first, max 3 per file per pass, so we never flood you.
    const sorted = [...current]
      .sort((a, b) => a.severity - b.severity)
      .slice(0, 3);

    for (const d of sorted) {
      const id = `${key}:${d.range.start.line}:${String(d.code ?? "")}:${d.message}`;
      const existing = previous.get(id);
      if (existing) {
        next.set(id, existing); // already reported, stay quiet
        continue;
      }
      const severity: Severity =
        d.severity === vscode.DiagnosticSeverity.Error ? "error" : "warning";
      const code =
        typeof d.code === "object"
          ? String(d.code.value)
          : d.code !== undefined
            ? String(d.code)
            : undefined;
      const issue: DetectedIssue = {
        id,
        severity,
        source: "diagnostic",
        title: d.message.split("\n")[0],
        message: d.message,
        code,
        file: vscode.workspace.asRelativePath(uri),
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        context: await collectContext(uri, d.range.start.line + 1),
      };
      next.set(id, issue);
      this.issueEmitter.fire(issue);
    }

    // Anything reported before that is gone now = you fixed it.
    for (const [id, issue] of previous) {
      if (!next.has(id) && !current.some((d) => id.endsWith(`:${d.message}`))) {
        this.resolvedEmitter.fire(issue);
      }
    }

    this.reported.set(key, next);
  }

  dispose() {
    this.timers.forEach(clearTimeout);
    this.disposables.forEach((d) => d.dispose());
    this.issueEmitter.dispose();
    this.resolvedEmitter.dispose();
  }
}
