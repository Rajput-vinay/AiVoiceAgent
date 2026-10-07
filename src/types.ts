export type Severity = "error" | "warning" | "suggestion";

export interface CodeContext {
  filePath: string;
  languageId: string;
  startLine: number; // 1-based first line of `surroundingCode`
  surroundingCode: string;
  selectedText: string;
  cursorLine?: number; // 1-based
}

export interface DetectedIssue {
  id: string;
  severity: Severity;
  source: "diagnostic" | "terminal";
  title: string; // short message
  message: string; // full message
  code?: string; // e.g. TS2304
  file?: string;
  line?: number; // 1-based
  column?: number;
  context?: CodeContext;
  rawOutput?: string; // for terminal failures
}

export type Certainty = "confirmed" | "likely" | "speculation";

export interface Analysis {
  severity: Severity;
  certainty: Certainty;
  title: string;
  explanation: string; // what is wrong
  why: string; // why it happened
  suggestion: string; // exact change the USER should make
  example?: string; // small before/after
  spoken: string; // 2-3 sentence voice script (used in Phase 3)
  needsMoreContext?: string; // what the model wants to see, if unsure
  confidence: number; // 0..1
}