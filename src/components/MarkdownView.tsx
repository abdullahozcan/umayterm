import { useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function toPlainText(children: ReactNode): string {
  if (children == null) return "";
  if (typeof children === "string" || typeof children === "number")
    return String(children);
  if (Array.isArray(children)) return children.map(toPlainText).join("");
  if (typeof children === "object" && "props" in children && children.props) {
    return toPlainText((children.props as { children?: ReactNode }).children);
  }
  return "";
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // geri dönüş yoluna düş
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{language || "text"}</span>
        <button
          className={`code-copy-btn ${copied ? "copied" : ""}`}
          onClick={() => void onCopy()}
          title="Kodu kopyala"
        >
          {copied ? "✓ Kopyalandı" : "Kopyala"}
        </button>
      </div>
      <pre className="code-block-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function MarkdownView({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a target="_blank" rel="noreferrer" {...props} />
          ),
          code: ({ node: _node, className, children }) => {
            const match = /language-([\w-]+)/.exec(className || "");
            const lang = match ? match[1] : "";
            const text = toPlainText(children);
            const isBlock = lang !== "" || text.includes("\n");
            if (!isBlock) {
              return <code className="md-inline-code">{children}</code>;
            }
            return <CodeBlock language={lang} code={text} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}