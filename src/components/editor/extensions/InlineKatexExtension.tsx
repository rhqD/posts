import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import katex from "katex";

function InlineKatexView({ node, updateAttributes, deleteNode, selected, editor, getPos }: NodeViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formula, setFormula] = useState(node.attrs.formula);
  const spanRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 当节点被选中时自动进入编辑模式
  useEffect(() => {
    if (selected && !isEditing) {
      setIsEditing(true);
    }
  }, [selected, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing && spanRef.current && formula) {
      try {
        spanRef.current.innerHTML = "";
        katex.render(formula, spanRef.current, { throwOnError: false });
      } catch (e) {
        spanRef.current.textContent = formula;
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

  if (isEditing) {
    return (
      <NodeViewWrapper as="span" className="inline-block">
        <input
          ref={inputRef}
          type="text"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            const input = e.currentTarget;
            const cursorPos = input.selectionStart ?? 0;
            const isAtStart = cursorPos === 0;
            const isAtEnd = cursorPos === formula.length;

            if (e.key === "ArrowLeft" && isAtStart) {
              e.preventDefault();
              updateAttributes({ formula });
              setIsEditing(false);
              // 将光标移到公式左边
              const pos = getPos();
              editor.commands.focus();
              editor.commands.setTextSelection(pos);
            } else if (e.key === "ArrowRight" && isAtEnd) {
              e.preventDefault();
              updateAttributes({ formula });
              setIsEditing(false);
              // 将光标移到公式右边
              const pos = getPos();
              editor.commands.focus();
              editor.commands.setTextSelection(pos + node.nodeSize);
            } else if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            } else if (e.key === "Escape") {
              if (!node.attrs.formula) deleteNode();
              else {
                setFormula(node.attrs.formula);
                setIsEditing(false);
              }
            }
          }}
          className="border border-blue-500 rounded px-2 py-0.5 font-mono text-sm"
          placeholder="E=mc^2"
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      className="inline-katex rounded px-1 mx-0.5"
    >
      <span ref={spanRef} />
    </NodeViewWrapper>
  );
}

export const InlineKatexExtension = Node.create({
  name: "inlineKatex",
  inline: true,
  group: "inline",
  atom: true,

  addAttributes() {
    return {
      formula: { default: "" },
    };
  },

  parseHTML() {
    return [{
      tag: "span.inline-katex[data-formula]",
      getAttrs: (dom) => {
        const formula = (dom as HTMLElement).getAttribute("data-formula");
        return { formula };
      }
    }];
  },

  renderHTML({ node }) {
    return ["span", { class: "inline-katex", "data-formula": node.attrs.formula }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineKatexView);
  },
});
