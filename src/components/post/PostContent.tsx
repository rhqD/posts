'use client';

import { useEffect, useRef, useState } from "react";
import type { Post } from "@/lib/supabase/types";
import "katex/dist/katex.min.css";

interface PostContentProps {
  post: Post;
}

function isLexicalJSON(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return parsed?.root?.type === "root";
  } catch {
    return false;
  }
}

async function lexicalJSONToHTML(json: string): Promise<string> {
  const { createHeadlessEditor } = await import("@lexical/headless");
  const { $generateHtmlFromNodes } = await import("@lexical/html");
  const { HeadingNode, QuoteNode } = await import("@lexical/rich-text");
  const { ListNode, ListItemNode } = await import("@lexical/list");
  const { CodeNode, CodeHighlightNode } = await import("@lexical/code");
  const { LinkNode } = await import("@lexical/link");
  const { ImageNode } = await import("@/components/editor/nodes/ImageNode");
  const { HorizontalRuleNode } = await import("@/components/editor/plugins/HorizontalRulePlugin");

  const editor = createHeadlessEditor({
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      CodeNode,
      CodeHighlightNode,
      LinkNode,
      ImageNode,
      HorizontalRuleNode,
    ],
  });

  const state = editor.parseEditorState(json);
  editor.setEditorState(state);

  let html = "";
  editor.update(() => {
    html = $generateHtmlFromNodes(editor);
  });

  return html;
}

export default function PostContent({ post }: PostContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const content = post.content ?? "";
  const isLexical = isLexicalJSON(content);

  useEffect(() => {
    if (isLexical) {
      lexicalJSONToHTML(content).then(setHtml);
    }
  }, [content, isLexical]);

  // For legacy HTML content, render KaTeX and Mermaid
  useEffect(() => {
    if (!contentRef.current) return;
    if (isLexical && html === null) return;

    const el = contentRef.current;

    // Re-render mermaid diagrams
    const mermaidBlocks = el.querySelectorAll(".mermaid-wrapper");
    if (mermaidBlocks.length > 0) {
      import("mermaid").then(({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, theme: "default" });
        mermaid.run({ nodes: Array.from(mermaidBlocks) as HTMLElement[] });
      });
    }

    // Re-render KaTeX
    const katexBlocks = el.querySelectorAll(".katex-block");
    const katexInline = el.querySelectorAll(".inline-katex");
    if (katexBlocks.length > 0 || katexInline.length > 0) {
      (async () => {
        const katex = (await import("katex")).default;
        katexBlocks.forEach((block) => {
          const formula = block.getAttribute("data-formula") ?? "";
          const target = block as HTMLElement;
          target.innerHTML = "";
          try {
            katex.render(formula, target, { displayMode: true, throwOnError: false });
          } catch {}
        });
        katexInline.forEach((span) => {
          const formula = span.getAttribute("data-formula") ?? "";
          const target = span as HTMLElement;
          target.innerHTML = "";
          try {
            katex.render(formula, target, { displayMode: false, throwOnError: false });
          } catch {}
        });
      })();
    }
  }, [isLexical, html, content]);

  const renderedHtml = isLexical ? html : content;

  if (isLexical && html === null) {
    return <div className="prose prose-lg prose-gray max-w-none animate-pulse h-40 bg-stone-100 rounded-lg" />;
  }

  return (
    <div
      ref={contentRef}
      className="prose prose-lg prose-gray max-w-none"
      dangerouslySetInnerHTML={{ __html: renderedHtml ?? "" }}
    />
  );
}
