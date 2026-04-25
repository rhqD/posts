import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { registerExtension } from './registry';

function ColumnsView({ node, updateAttributes }: NodeViewProps) {
  const columns = node.attrs.columns || 2;

  return (
    <NodeViewWrapper className="my-4">
      <div className="flex gap-4 border border-gray-200 rounded-lg p-4">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="flex-1 min-w-0">
            <NodeViewContent className="prose prose-sm" />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2 text-xs text-gray-500">
        {[2, 3, 4].map(n => (
          <button
            key={n}
            onClick={() => updateAttributes({ columns: n })}
            className={`px-2 py-1 rounded ${columns === n ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
          >
            {n}列
          </button>
        ))}
      </div>
    </NodeViewWrapper>
  );
}

export const ColumnsExtension = Node.create({
  name: "columns",
  group: "block",
  content: "block+",

  addAttributes() {
    return {
      columns: { default: 2 },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-columns]" }];
  },

  renderHTML({ node }) {
    return ["div", { "data-columns": node.attrs.columns, class: "columns" }, 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnsView);
  },
});

registerExtension({
  extension: ColumnsExtension,
  slashCommands: [{
    title: 'Columns',
    description: '多列布局',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'columns',
        attrs: { columns: 2 },
        content: [{ type: 'paragraph' }]
      }).run();
    }
  }]
});
