"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

import { SyntaxHighlighter } from "@/components/chat/code-languages";
import { blueprintCodeTheme } from "@/components/chat/code-theme";
import { cn } from "@/lib/utils";

/**
 * Agents are prompted to cite code as `path/to/file.py (lines 12-40)`, and a
 * fenced block that follows such a reference gets it as a header. Matching a
 * path with an extension (optionally with a line range) keeps this from
 * grabbing arbitrary prose.
 */
const FILE_REFERENCE = /([\w./-]+\.\w{1,10})(?:\s*\(lines?\s*[\d–\-\s]+\))?/;

function extractFilePath(meta: string | null | undefined): string | null {
  if (!meta) return null;
  const match = meta.match(FILE_REFERENCE);
  return match ? match[1] : null;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure origin, denied permission) — the
      // code is still selectable, so failing quietly beats an error toast.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy code"}
      className="flex items-center gap-1 rounded-sm px-2 py-1 font-mono text-xs text-foreground-muted transition-colors duration-base ease-out hover:bg-accent hover:text-foreground"
    >
      {copied ? (
        <>
          <Check className="size-3 text-success" aria-hidden /> copied
        </>
      ) : (
        <>
          <Copy className="size-3" aria-hidden /> copy
        </>
      )}
    </button>
  );
}

function CodeBlock({
  language,
  filePath,
  value,
}: {
  language: string;
  filePath: string | null;
  value: string;
}) {
  return (
    <figure className="overflow-hidden rounded-md border border-subtle bg-canvas">
      <figcaption className="flex items-center justify-between gap-3 border-b border-subtle px-3 py-1.5">
        <span className="truncate font-mono text-xs text-foreground-secondary">
          {filePath ?? language ?? "code"}
        </span>
        <CopyButton value={value} />
      </figcaption>
      <div className="overflow-x-auto p-3">
        <SyntaxHighlighter
          language={language || "text"}
          style={blueprintCodeTheme}
          PreTag="div"
          // The wrapper already scrolls; letting the highlighter add its own
          // would produce a nested scroll region.
          customStyle={{ background: "transparent", margin: 0, padding: 0 }}
        >
          {value}
        </SyntaxHighlighter>
      </div>
    </figure>
  );
}

export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="space-y-4 text-foreground-secondary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          h1: ({ children }) => <h3 className="text-lg text-foreground">{children}</h3>,
          h2: ({ children }) => <h3 className="text-lg text-foreground">{children}</h3>,
          h3: ({ children }) => <h4 className="text-base text-foreground">{children}</h4>,
          h4: ({ children }) => <h5 className="text-sm text-foreground">{children}</h5>,
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5 marker:text-foreground-muted">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5 marker:text-foreground-muted">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-brand underline-offset-4 hover:underline"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-medium text-foreground">{children}</strong>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-strong pl-3 text-foreground-muted">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="rule" />,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-subtle px-3 py-1.5 text-left font-medium text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-subtle px-3 py-1.5 align-top">{children}</td>
          ),
          code: ({ className, children, node, ...props }) => {
            const raw = String(children ?? "").replace(/\n$/, "");
            const languageMatch = /language-(\w+)/.exec(className ?? "");
            // A fence's info string beyond the language (```py app/graph/x.py)
            // lands on the node as `meta`, not in className.
            const meta = (node as { data?: { meta?: string } } | undefined)?.data?.meta;

            // Inline code: no fence, so no language class.
            if (!languageMatch) {
              return (
                <code
                  className={cn(
                    "rounded-sm bg-elevated px-1.5 py-0.5 font-mono text-xs text-foreground"
                  )}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock
                language={languageMatch[1]}
                filePath={extractFilePath(meta)}
                value={raw}
              />
            );
          },
          // react-markdown wraps fenced blocks in <pre>; CodeBlock brings its
          // own container, so this just passes through.
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
