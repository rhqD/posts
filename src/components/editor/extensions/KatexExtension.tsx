import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

function KatexNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const [isEditing, setIsEditing] = useState(!node.attrs.formula);
  const [formula, setFormula] = useState(node.attrs.formula);
  const [error, setError] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing && previewRef.current && formula) {
      try {
        previewRef.current.innerHTML = "";
        katex.render(formula, previewRef.current, {
          throwOnError: false,
          displayMode: true,
        });
        setError("");
      } catch (e: any) {
        setError(e.message);
      }
    }
  }, [isEditing, formula]);

  const handleSave = () => {
    if (!formula.trim()) {
      deleteNode();
      return;
    }
    updateAttributes({ formula });
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (!node.attrs.formula) {
        deleteNode();
      } else {
        setFormula(node.attrs.formula);
        setIsEditing(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <NodeViewWrapper className="katex-node-wrapper my-2">
      {isEditing ? (
        <div className="border border-blue-500 rounded-lg p-3 bg-white shadow-sm">
          <textarea
            ref={inputRef}
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            placeholder="输入 LaTeX 公式，例如: E = mc^2"
            className="w-full font-mono text-sm border-0 outline-none resize-none"
            rows={3}
          />
          <div className="text-xs text-gray-500 mt-2">
            按 Esc 取消 · Enter 保存 · Shift+Enter 换行
          </div>
        </div>
      ) : (
        <div
          onClick={() => setIsEditing(true)}
          className="cursor-pointer hover:bg-gray-50 rounded-lg p-4 transition-colors"
          contentEditable={false}
        >
          <div ref={previewRef} className="text-center" />
          {error && <div className="text-red-500 text-xs mt-2">{error}</div>}
        </div>
      )}
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
    return [{
      tag: "div.katex-block[data-formula]",
      getAttrs: (dom) => {
        const formula = (dom as HTMLElement).getAttribute("data-formula");
        return { formula };
      }
    }];
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
