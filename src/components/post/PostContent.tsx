'use client';

import { useEffect, useRef } from "react";
import type { Post } from "@/lib/supabase/types";
import "katex/dist/katex.min.css";

interface PostContentProps {
  post: Post;
}

export default function PostContent({ post }: PostContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contentRef.current) return;

    // Re-render mermaid diagrams
    const mermaidBlocks = contentRef.current.querySelectorAll(".mermaid-wrapper");
    if (mermaidBlocks.length > 0) {
      import("mermaid").then(({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, theme: "default" });
        mermaid.run({ nodes: Array.from(mermaidBlocks) as HTMLElement[] });
      });
    }

    // Re-render KaTeX
    const katexBlocks = contentRef.current.querySelectorAll(".katex-block");
    const katexInline = contentRef.current.querySelectorAll(".inline-katex");
    if (katexBlocks.length > 0 || katexInline.length > 0) {
      (async () => {
        const katex = (await import("katex")).default;
        katexBlocks.forEach((block) => {
          const formula = block.getAttribute("data-formula") ?? "";
          const el = block as HTMLElement;
          el.innerHTML = "";
          try {
            katex.render(formula, el, { displayMode: true, throwOnError: false });
          } catch {}
        });
        katexInline.forEach((span) => {
          const formula = span.getAttribute("data-formula") ?? "";
          const el = span as HTMLElement;
          el.innerHTML = "";
          try {
            katex.render(formula, el, { displayMode: false, throwOnError: false });
          } catch {}
        });
      })();
    }
  }, [post.content]);

  return (
    <div
      ref={contentRef}
      className="prose prose-lg prose-gray max-w-none"
      dangerouslySetInnerHTML={{ __html: post.content ?? "" }}
    />
  );
}
