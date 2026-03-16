import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef } from "react";

function KatexNodeView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper className="katex-node-wrapper">
      <div
        className="katex-block my-4 p-4 bg-gray-50 rounded border border-gray-200 font-mono text-sm"
        data-formula={node.attrs.formula}
        contentEditable={false}
      >
        {node.attrs.formula}
      </div>
    </NodeViewWrapper>
  );
}

export const KatexExtension = Node.create({
  name: "katex",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      formula: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div.katex-block[data-formula]" }];
  },

  renderHTML({ node }) {
    return ["div", {
      class: "katex-block",
      "data-formula": node.attrs.formula
    }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KatexNodeView);
  },
});
