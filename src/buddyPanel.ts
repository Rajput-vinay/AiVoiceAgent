import * as vscode from "vscode";
import { Analysis, DetectedIssue } from "./types";

export type PanelState =
  | { kind: "loading" }
  | { kind: "analysis"; analysis: Analysis }
  | { kind: "error"; message: string }
  | { kind: "fixed" }
  | { kind: "idle" };

const ICON = { error: "🔴", warning: "🟡", suggestion: "🔵" } as const;
const CERTAINTY_LABEL = {
  confirmed: "✅ Confirmed error",
  likely: "🟠 Likely issue",
  speculation: "❓ Speculation",
} as const;

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

export class BuddyPanel {
  private panel?: vscode.WebviewPanel;

  show(issue?: DetectedIssue, state: PanelState = { kind: "idle" }) {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "buddy",
        "🤖 Coding Buddy",
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        {},
      );
      this.panel.onDidDispose(() => (this.panel = undefined));
    } else {
      this.panel.reveal(undefined, true);
    }
    this.panel.webview.html = this.render(issue, state);
  }

  private render(issue: DetectedIssue | undefined, state: PanelState): string {
    const where = issue
      ? issue.file
        ? `${esc(issue.file)}${issue.line ? ":" + issue.line : ""}`
        : "Terminal"
      : "";
    let body = "";

    if (state.kind === "idle" || !issue) {
      body = "<p>Koi issue nahi hai abhi. Main dekh raha hu. 👀</p>";
    } else if (state.kind === "fixed") {
      body = `<h2>✅ Fixed</h2><p><code>${where}</code></p><p>${esc(issue.title)}</p><p>Ye issue ab nahi dikh raha. Nice.</p>`;
    } else if (state.kind === "loading") {
      body = `<h2>${ICON[issue.severity]} ${issue.severity.toUpperCase()}</h2><p><code>${where}</code></p>
              <p><b>${esc(issue.title)}</b></p><p>🤔 Buddy soch raha hai...</p>`;
    } else if (state.kind === "error") {
      body = `<h2>${ICON[issue.severity]} ${issue.severity.toUpperCase()}</h2><p><code>${where}</code></p>
              <p><b>${esc(issue.title)}</b></p>
              <p class="err">⚠️ AI analysis fail hua: ${esc(state.message)}</p>
              ${issue.context ? `<pre>${esc(issue.context.surroundingCode)}</pre>` : ""}`;
    } else {
      const a = state.analysis;
      body = `
        <h2>${ICON[a.severity]} ${a.severity.toUpperCase()} &nbsp;<small>${CERTAINTY_LABEL[a.certainty]} · ${Math.round(a.confidence * 100)}%</small></h2>
        <p><code>${where}</code>${issue.code ? ` &nbsp;<small>${esc(issue.code)}</small>` : ""}</p>
        <p><b>${esc(a.title)}</b></p>
        <h4>Kya hua?</h4><p>${esc(a.explanation)}</p>
        <h4>Kyu hua?</h4><p>${esc(a.why)}</p>
        <h4>💡 Suggestion</h4><p>${esc(a.suggestion)}</p>
        ${a.example ? `<pre>${esc(a.example)}</pre>` : ""}
        ${a.needsMoreContext ? `<p class="warn">🔍 Confirm karne ke liye chahiye: ${esc(a.needsMoreContext)}</p>` : ""}
        <p class="muted">Main code change nahi karta. Tum manually fix karo, main verify kar dunga.</p>`;
    }

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
      <style>
        body{font-family:var(--vscode-font-family);padding:12px;color:var(--vscode-foreground);line-height:1.5}
        pre{background:var(--vscode-textCodeBlock-background);padding:8px;overflow:auto;max-height:260px;font-size:12px;white-space:pre-wrap}
        code{font-family:var(--vscode-editor-font-family)}
        h4{margin:14px 0 4px}
        .err{color:var(--vscode-errorForeground)} .warn{color:var(--vscode-editorWarning-foreground)} .muted{opacity:.6;font-size:12px}
      </style></head><body><h3>🤖 Coding Buddy</h3>${body}</body></html>`;
  }
}
