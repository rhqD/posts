'use client';

import { useEffect, useRef } from "react";
import type { Post } from "@/lib/supabase/types";

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
    if (katexBlocks.length > 0) {
      import("katex").then(({ default: katex }) => {
        katexBlocks.forEach((block) => {
          const formula = block.getAttribute("data-formula") ?? "";
          try {
            katex.render(formula, block as HTMLElement, { displayMode: true, throwOnError: false });
          } catch {}
        });
      });
    }
  }, [post.content]);

  return (
    <div
      ref={contentRef}
      className="prose prose-gray max-w-none"
      dangerouslySetInnerHTML={{ __html: post.content ?? "" }}
    />
  );
}
