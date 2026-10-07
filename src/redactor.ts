const PATTERNS: Array<[RegExp, string]> = [
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    "[REDACTED_PRIVATE_KEY]",
  ],
  [
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    "[REDACTED_JWT]",
  ],
  [/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED_AWS_KEY]"],
  [
    /\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,})\b/g,
    "[REDACTED_TOKEN]",
  ],
  [/\b(Bearer)\s+[A-Za-z0-9._~+\/-]{12,}=*/gi, "$1 [REDACTED]"],
  [/([a-z]+:\/\/[^\s:@\/]+:)[^\s@\/]+@/gi, "$1[REDACTED]@"],
  [
    /\b((?:[A-Za-z0-9_]*?)(?:api[_-]?key|secret|token|passwd|password|pwd|private[_-]?key)[A-Za-z0-9_]*\s*[:=]\s*)(['"`]?)[^\s'"`,;]{4,}\2/gi,
    "$1$2[REDACTED]$2",
  ],
];

export function redact(text: string): string {
  return PATTERNS.reduce((out, [re, rep]) => out.replace(re, rep), text);
}
