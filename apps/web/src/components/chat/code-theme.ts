import type { CSSProperties } from "react";

/**
 * A Prism theme for react-syntax-highlighter built entirely from design
 * tokens, so code blocks follow the palette (and the light/dark switch)
 * instead of shipping a second, unrelated colour scheme.
 */
const base: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-xs)",
  lineHeight: 1.7,
  background: "transparent",
  color: "var(--text-primary)",
};

const token = (color: string, extra: CSSProperties = {}): CSSProperties => ({
  color,
  ...extra,
});

const KEYWORD = "rgb(var(--code-keyword-rgb))";
const STRING = "rgb(var(--code-string-rgb))";
const FUNCTION = "rgb(var(--code-function-rgb))";
const NUMBER = "rgb(var(--code-number-rgb))";
const COMMENT = "rgb(var(--code-comment-rgb))";
const PUNCT = "var(--text-secondary)";

export const blueprintCodeTheme: Record<string, CSSProperties> = {
  'code[class*="language-"]': base,
  'pre[class*="language-"]': { ...base, margin: 0, padding: 0, overflow: "auto" },

  comment: token(COMMENT, { fontStyle: "italic" }),
  prolog: token(COMMENT),
  doctype: token(COMMENT),
  cdata: token(COMMENT),

  punctuation: token(PUNCT),
  operator: token(PUNCT),

  keyword: token(KEYWORD),
  "at-rule": token(KEYWORD),
  atrule: token(KEYWORD),
  important: token(KEYWORD, { fontWeight: "600" }),
  "rule": token(KEYWORD),

  string: token(STRING),
  char: token(STRING),
  "attr-value": token(STRING),
  regex: token(STRING),

  function: token(FUNCTION),
  "class-name": token(FUNCTION),
  "function-variable": token(FUNCTION),

  number: token(NUMBER),
  boolean: token(NUMBER),
  constant: token(NUMBER),
  symbol: token(NUMBER),

  tag: token(KEYWORD),
  "attr-name": token(FUNCTION),
  selector: token(FUNCTION),
  property: token(FUNCTION),
  variable: token("var(--text-primary)"),
  builtin: token(FUNCTION),

  inserted: token(STRING),
  deleted: token("var(--danger)"),
};
