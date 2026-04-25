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

  renderHTML({ node }) {
    return ["div", {
      class: "mermaid-wrapper",
      "data-mermaid": node.attrs.code
    }, node.attrs.code];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView);
  },
});

import { registerExtension } from './registry';

registerExtension({
  extension: MermaidExtension,
  slashCommands: [{
    title: 'Mermaid Diagram',
    description: '流程图/图表',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const code = prompt('输入 Mermaid 代码:');
      if (code) {
        editor.chain().focus().insertContent({ type: 'mermaid', attrs: { code } }).run();
      }
    }
  }]
});
