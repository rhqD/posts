import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef } from "react";

function KatexNodeView({ node }: NodeViewProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    import("katex").then(({ default: katex }) => {
      katex.render(node.attrs.formula, ref.current!, {
        displayMode: true,
        throwOnError: false,
      });
    });
  }, [node.attrs.formula]);

  return (
    <NodeViewWrapper>
      <div
        ref={ref}
        className="katex-block my-4 overflow-x-auto"
        data-formula={node.attrs.formula}
      />
    </NodeViewWrapper>
  );
}

export const KatexExtension = Node.create({
  name: "katex",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      formula: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-formula]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, {
      class: "katex-block",
      "data-formula": HTMLAttributes.formula
    })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KatexNodeView);
  },
});
