import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef } from "react";

function MermaidNodeView({ node }: NodeViewProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = `<div class="mermaid-wrapper">${node.attrs.code}</div>`;
    import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: "default" });
      mermaid.run({ nodes: ref.current ? [ref.current.firstChild as HTMLElement] : [] });
    });
  }, [node.attrs.code]);

  return (
    <NodeViewWrapper>
      <div ref={ref} className="my-4" />
    </NodeViewWrapper>
  );
}

export const MermaidExtension = Node.create({
  name: "mermaid",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      code: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-mermaid]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "mermaid-wrapper" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },
});
