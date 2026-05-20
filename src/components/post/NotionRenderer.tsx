"use client";

import { useEffect, useRef } from "react";
import "katex/dist/katex.min.css";
import "prismjs/themes/prism-tomorrow.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionBlock = any;

function resolveImageUrl(url: string, blockId?: string): string {
  if (!url) return "";
  if (url.includes("amazonaws.com") || url.includes("notion-static") || url.includes("secure.notion")) {
    const params = new URLSearchParams();
    params.set("url", url);
    if (blockId) params.set("block_id", blockId);
    return `/api/notion-image?${params.toString()}`;
  }
  return url;
}

// Inline KaTeX renderer
function InlineKatex({ formula }: { formula: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    import("katex").then(({ default: katex }) => {
      try {
        katex.render(formula, ref.current!, { displayMode: false, throwOnError: false });
      } catch {}
    });
  }, [formula]);
  return <span ref={ref} className="select-text" />;
}

function BlockKatex({ formula }: { formula: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    import("katex").then(({ default: katex }) => {
      try {
        katex.render(formula, ref.current!, { displayMode: true, throwOnError: false });
      } catch {}
    });
  }, [formula]);
  return <div ref={ref} className="my-6 overflow-x-auto" />;
}

function RichText({ text }: { text: NotionBlock[] }) {
  if (!text?.length) return null;
  return (
    <>
      {text.map((t, i) => {
        // Inline equation
        if (t.type === "equation") {
          return <InlineKatex key={i} formula={t.equation?.expression || ""} />;
        }
        const annotations = t.annotations || {};
        let cls = "";
        if (annotations.bold) cls += " font-bold";
        if (annotations.italic) cls += " italic";
        if (annotations.strikethrough) cls += " line-through";
        if (annotations.code) cls += " bg-stone-100 dark:bg-stone-800 px-1 py-0.5 rounded text-sm font-mono text-red-600";
        const url = t.text?.link?.url || t.href;
        const content = t.plain_text || "";
        if (url) return <a key={i} href={url} className={`underline underline-offset-2 ${cls}`}>{content}</a>;
        return <span key={i} className={cls}>{content}</span>;
      })}
    </>
  );
}

function BlockRenderer({ block, pageId }: { block: NotionBlock; pageId: string }) {
  const type = block.type;
  const value = block[type as string] || {};
  const children = block.children as NotionBlock[] | undefined;

  switch (type) {
    case "paragraph":
      return <p className="my-2 leading-relaxed"><RichText text={value.rich_text} /></p>;

    case "heading_1":
      return <h1 className="text-3xl font-bold mt-8 mb-3"><RichText text={value.rich_text} /></h1>;

    case "heading_2":
      return <h2 className="text-2xl font-semibold mt-6 mb-2"><RichText text={value.rich_text} /></h2>;

    case "heading_3":
      return <h3 className="text-xl font-semibold mt-5 mb-2"><RichText text={value.rich_text} /></h3>;

    case "bulleted_list_item":
      return (
        <li className="ml-5 list-disc my-1">
          <RichText text={value.rich_text} />
          {children && <ul className="ml-4">{children.map((c, i) => <BlockRenderer key={i} block={c} pageId={pageId} />)}</ul>}
        </li>
      );

    case "numbered_list_item":
      return (
        <li className="ml-5 list-decimal my-1">
          <RichText text={value.rich_text} />
          {children && <ol className="ml-4">{children.map((c, i) => <BlockRenderer key={i} block={c} pageId={pageId} />)}</ol>}
        </li>
      );

    case "equation":
      return <BlockKatex formula={value.expression || ""} />;

    case "code":
      return (
        <CodeBlock
          code={value.rich_text?.map((t: NotionBlock) => t.plain_text).join("") || ""}
          language={value.language || "plain text"}
        />
      );

    case "quote":
      return (
        <blockquote className="border-l-4 border-green-400 pl-4 my-4 italic text-stone-500">
          <RichText text={value.rich_text} />
          {children && children.map((c, i) => <BlockRenderer key={i} block={c} pageId={pageId} />)}
        </blockquote>
      );

    case "callout":
      return (
        <div className="flex gap-3 p-4 my-4 rounded-xl bg-stone-50 dark:bg-stone-800 border">
          {value.icon?.emoji && <span className="text-xl">{value.icon.emoji}</span>}
          <div className="flex-1"><RichText text={value.rich_text} /></div>
        </div>
      );

    case "image": {
      const file = value.file || value.external || {};
      const src = file.url || "";
      if (!src) return null;
      const resolved = resolveImageUrl(src, block.id);
      return (
        <figure className="my-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolved}
            alt={value.caption?.[0]?.plain_text || ""}
            className="rounded-xl w-full"
            loading="lazy"
          />
          {value.caption?.length > 0 && (
            <figcaption className="text-center text-sm text-stone-400 mt-2">
              <RichText text={value.caption} />
            </figcaption>
          )}
        </figure>
      );
    }

    case "divider":
      return <hr className="my-8 border-stone-200 dark:border-stone-700" />;

    case "bookmark":
      return (
        <a
          href={value.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-4 my-4 rounded-xl border hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
        >
          <div className="text-sm font-medium">{value.caption?.[0]?.plain_text || value.url}</div>
          <div className="text-xs text-stone-400 truncate">{value.url}</div>
        </a>
      );

    case "toggle":
      return (
        <details className="my-3">
          <summary className="cursor-pointer text-stone-500"><RichText text={value.rich_text} /></summary>
          <div className="ml-4 mt-2 pl-4 border-l-2 border-stone-200">
            {children && children.map((c, i) => <BlockRenderer key={i} block={c} pageId={pageId} />)}
          </div>
        </details>
      );

    case "table":
      return <TableRenderer block={block} pageId={pageId} />;

    case "table_row":
      return null;

    case "column_list":
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
          {children && children.map((c, i) => <BlockRenderer key={i} block={c} pageId={pageId} />)}
        </div>
      );

    case "column":
      return <div>{children && children.map((c, i) => <BlockRenderer key={i} block={c} pageId={pageId} />)}</div>;

    default:
      if (value.rich_text?.length > 0) {
        return <p className="my-2"><RichText text={value.rich_text} /></p>;
      }
      if (children) {
        return <>{children.map((c, i) => <BlockRenderer key={i} block={c} pageId={pageId} />)}</>;
      }
      return null;
  }
}

const languageMap: Record<string, string> = {
  "plain text": "plain",
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  rust: "rust",
  bash: "bash",
  shell: "bash",
  css: "css",
  html: "markup",
  json: "json",
  jsx: "jsx",
  tsx: "tsx",
  sql: "sql",
  yaml: "yaml",
  markdown: "markdown",
  go: "go",
  java: "java",
  c: "c",
  "c++": "cpp",
  cpp: "cpp",
};

function CodeBlock({ code, language }: { code: string; language: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const prismLang = languageMap[language] || language || "plain";

  useEffect(() => {
    if (!ref.current) return;
    if (language === "mermaid") {
      import("mermaid").then(({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, theme: "default" });
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        ref.current!.innerHTML = `<div class="mermaid" id="${id}">${code}</div>`;
        mermaid.run({ nodes: [document.getElementById(id)!] as unknown as HTMLElement[] });
      });
      return;
    }
    // Syntax highlight with Prism
    import("prismjs").then(async ({ default: Prism }) => {
      try {
        await import(`prismjs/components/prism-${prismLang}.js`);
      } catch {}
      const html = Prism.highlight(code, Prism.languages[prismLang] || Prism.languages.plain, prismLang);
      ref.current!.innerHTML = `<pre class="language-${prismLang}"><code class="language-${prismLang}">${html}</code></pre>`;
    });
  }, [code, language, prismLang]);

  if (language === "mermaid") {
    return <div ref={ref} className="my-6 overflow-x-auto rounded-xl p-4 bg-white border" />;
  }

  return (
    <div
      ref={ref}
      className="my-6 overflow-x-auto rounded-xl text-sm leading-relaxed"
    >
      {/* Fallback while Prism loads */}
      <pre className="p-5 bg-stone-900 text-stone-100"><code>{code}</code></pre>
    </div>
  );
}

function TableRenderer({ block, pageId }: { block: NotionBlock; pageId: string }) {
  const children = block.children as NotionBlock[] | undefined;
  const rows = children?.filter((c) => c.type === "table_row") || [];
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto my-6">
      <table className="w-full border-collapse border border-stone-200 dark:border-stone-700">
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri === 0 ? "bg-stone-50 dark:bg-stone-800" : ""}>
              {row.table_row?.cells?.map((cell: NotionBlock[][], ci: number) => (
                <td key={ci} className="border border-stone-200 dark:border-stone-700 px-4 py-2">
                  {cell.map((t, ti) => <RichText key={ti} text={t} />)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Main renderer ---
export default function NotionRenderer({ blocks }: { blocks: NotionBlock[] }) {
  if (!blocks?.length) {
    return <p className="text-stone-400 italic">No content.</p>;
  }

  return (
    <div className="prose prose-stone prose-lg max-w-none dark:prose-invert">
      {blocks.map((block, i) => (
        <BlockRenderer key={block.id || i} block={block} pageId="" />
      ))}
    </div>
  );
}
