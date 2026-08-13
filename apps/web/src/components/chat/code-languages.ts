import { PrismLight } from "react-syntax-highlighter";

import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";

/**
 * The default `Prism` export bundles every language Prism supports (~250kB on
 * this route alone). Registering just the ones this codebase's repos are
 * likely to contain keeps the chat page — the one users sit on longest —
 * from paying for Fortran support.
 *
 * Anything unregistered still renders, just without highlighting.
 */
const LANGUAGES: Record<string, unknown> = {
  bash,
  css,
  diff,
  go,
  java,
  javascript,
  json,
  jsx,
  markdown,
  python,
  ruby,
  rust,
  sql,
  tsx,
  typescript,
  yaml,
};

for (const [name, definition] of Object.entries(LANGUAGES)) {
  PrismLight.registerLanguage(name, definition);
}

// Common aliases agents write in fences.
PrismLight.registerLanguage("js", javascript);
PrismLight.registerLanguage("ts", typescript);
PrismLight.registerLanguage("py", python);
PrismLight.registerLanguage("sh", bash);
PrismLight.registerLanguage("shell", bash);
PrismLight.registerLanguage("yml", yaml);
PrismLight.registerLanguage("md", markdown);

export { PrismLight as SyntaxHighlighter };
