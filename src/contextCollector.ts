import * as vscode from "vscode";
import * as path from "path";
import { CodeContext } from "./types";

const SENSITIVE = [
  /^\.env(\..*)?$/i,
  /\.(pem|key|p12|pfx)$/i,
  /^id_(rsa|ed25519)/i,
  /credentials/i,
  /secrets?\./i,
];
const RADIUS = 15;

export function isSensitiveFile(filePath: string): boolean {
  const name = path.basename(filePath);
  return SENSITIVE.some((re) => re.test(name));
}

export async function collectContext(
  uri: vscode.Uri,
  line1?: number,
): Promise<CodeContext | undefined> {
  if (isSensitiveFile(uri.fsPath)) return undefined;

  // openTextDocument only reads; it never modifies the file.
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.toString() === uri.toString(),
  );

  const center0 =
    (line1 ?? (editor ? editor.selection.active.line + 1 : 1)) - 1;
  const start0 = Math.max(0, center0 - RADIUS);
  const end0 = Math.min(doc.lineCount - 1, center0 + RADIUS);
  const range = new vscode.Range(start0, 0, end0, doc.lineAt(end0).text.length);

  return {
    filePath: vscode.workspace.asRelativePath(uri),
    languageId: doc.languageId,
    startLine: start0 + 1,
    surroundingCode: doc.getText(range),
    selectedText:
      editor && !editor.selection.isEmpty ? doc.getText(editor.selection) : "",
    cursorLine: editor ? editor.selection.active.line + 1 : undefined,
  };
}
