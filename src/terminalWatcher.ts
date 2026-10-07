import * as vscode from "vscode";
import { DetectedIssue } from "./types";

const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const MAX_CHARS = 12000;

export class TerminalWatcher implements vscode.Disposable {
  private outputs = new Map<vscode.TerminalShellExecution, Promise<string>>();
  private disposables: vscode.Disposable[] = [];
  private readonly emitter = new vscode.EventEmitter<DetectedIssue>();
  readonly onIssue = this.emitter.event;

  constructor() {
    this.disposables.push(
      vscode.window.onDidStartTerminalShellExecution((e) => {
        this.outputs.set(e.execution, this.capture(e.execution));
      }),
      vscode.window.onDidEndTerminalShellExecution(async (e) => {
        const pending = this.outputs.get(e.execution);
        this.outputs.delete(e.execution);
        if (!pending || e.exitCode === undefined || e.exitCode === 0) return;

        const output = await pending;
        const command = e.execution.commandLine.value;
        this.emitter.fire({
          id: `terminal:${Date.now()}`,
          severity: "error",
          source: "terminal",
          title: `Command failed (exit ${e.exitCode}): ${command}`,
          message: `Command "${command}" exited with code ${e.exitCode}`,
          rawOutput: output,
        });
      }),
    );
  }

  private async capture(
    execution: vscode.TerminalShellExecution,
  ): Promise<string> {
    let text = "";
    for await (const chunk of execution.read()) {
      text += chunk;
      if (text.length > MAX_CHARS * 2) text = text.slice(-MAX_CHARS * 2); // keep the tail; errors are at the end
    }
    return text.replace(ANSI, "").slice(-MAX_CHARS);
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.emitter.dispose();
  }
}
