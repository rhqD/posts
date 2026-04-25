import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { registerExtension } from './registry';

const types = [
  { value: 'info', label: 'ℹ️ 信息', color: 'bg-blue-50 border-blue-200' },
  { value: 'warning', label: '⚠️ 警告', color: 'bg-yellow-50 border-yellow-200' },
  { value: 'error', label: '❌ 错误', color: 'bg-red-50 border-red-200' },
  { value: 'success', label: '✅ 成功', color: 'bg-green-50 border-green-200' },
];

function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const type = node.attrs.type || 'info';
  const current = types.find(t => t.value === type) || types[0];

  return (
    <NodeViewWrapper>
      <div className={`my-4 p-4 rounded-lg border-l-4 ${current.color}`}>
        <select
          value={type}
          onChange={(e) => updateAttributes({ type: e.target.value })}
          className="text-xs mb-2 px-2 py-1 rounded border"
          contentEditable={false}
        >
          {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <NodeViewContent className="prose prose-sm" />
      </div>
    </NodeViewWrapper>
  );
}

export const CalloutExtension = Node.create({
  name: "callout",
  group: "block",
  content: "block+",

  addAttributes() {
    return {
      type: { default: "info" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ node }) {
    return ["div", { "data-callout": node.attrs.type, class: "callout" }, 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

registerExtension({
  extension: CalloutExtension,
  slashCommands: [{
    title: 'Callout',
    description: '提示框',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'callout',
        attrs: { type: 'info' },
        content: [{ type: 'paragraph' }]
      }).run();
    }
  }]
});
