import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { common, createLowlight } from "lowlight";
import { toHtml } from "hast-util-to-html";

const lowlight = createLowlight(common);

const languages = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "cpp", label: "C++" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
  { value: "json", label: "JSON" },
  { value: "bash", label: "Bash" },
  { value: "sql", label: "SQL" },
];

function CodeBlockView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const [code, setCode] = useState(node.attrs.code || "");
  const [language, setLanguage] = useState(node.attrs.language || "javascript");
  const [showLanguageSelect, setShowLanguageSelect] = useState(false);
  const [showDragHandle, setShowDragHandle] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current && code) {
      try {
        const result = lowlight.highlight(language, code);
        const html = toHtml(result);
        codeRef.current.innerHTML = html;
      } catch {
        codeRef.current.textContent = code;
      }
    }
  }, [code, language]);

  const handleBlur = () => {
    if (!code.trim()) {
      deleteNode();
      return;
    }
    updateAttributes({ code, language });
  };

  return (
    <NodeViewWrapper className="my-4">
      <div
        className="relative"
        onMouseEnter={() => {
          if (!isDragging) {
            setShowLanguageSelect(true);
            setShowDragHandle(true);
          }
        }}
        onMouseLeave={() => {
          if (!isDragging) {
            setShowLanguageSelect(false);
            setShowDragHandle(false);
          }
        }}
      >
        <div className="absolute left-[-32px] top-0 bottom-0 w-[32px]" />
        {showDragHandle && (
          <div
            className="absolute left-[-28px] top-2 cursor-grab active:cursor-grabbing z-20"
            contentEditable={false}
            draggable
            data-drag-handle
            onDragStart={() => {
              setIsDragging(true);
              setShowLanguageSelect(false);
            }}
            onDragEnd={() => setIsDragging(false)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-gray-400 hover:text-gray-600">
              <circle cx="4" cy="4" r="1.5"/>
              <circle cx="4" cy="8" r="1.5"/>
              <circle cx="4" cy="12" r="1.5"/>
              <circle cx="8" cy="4" r="1.5"/>
              <circle cx="8" cy="8" r="1.5"/>
              <circle cx="8" cy="12" r="1.5"/>
            </svg>
          </div>
        )}
        <div className="relative bg-[#1C1917] rounded-lg overflow-hidden">
        {showLanguageSelect && (
          <div className="absolute top-2 right-2 z-20">
            <select
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                updateAttributes({ code, language: e.target.value });
              }}
              className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700 focus:outline-none"
            >
              {languages.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <pre className="p-4 font-mono text-sm overflow-auto min-h-[120px] m-0">
          <code
            ref={codeRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => {
              const text = e.currentTarget.textContent || "";
              setCode(text);
              updateAttributes({ code: text, language });
            }}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                e.stopPropagation();
              }
            }}
            className="text-gray-100 outline-none"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {code || ''}
          </code>
        </pre>
      </div>
      </div>
    </NodeViewWrapper>
  );
}

export const CodeBlockExtension = Node.create({
  name: "codeBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  draggable: true,

  addAttributes() {
    return {
      language: { default: "javascript" },
      code: { default: "" },
    };
  },

  parseHTML() {
    return [{
      tag: "pre[data-language]",
      getAttrs: (dom) => {
        const language = (dom as HTMLElement).getAttribute("data-language");
        const code = (dom as HTMLElement).textContent;
        return { language, code };
      }
    }];
  },

  renderHTML({ node }) {
    return ["pre", {
      "data-language": node.attrs.language,
      class: "code-block"
    }, node.attrs.code];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});

import { registerExtension } from './registry';

registerExtension({
  extension: CodeBlockExtension,
  slashCommands: [{
    title: 'Code Block',
    description: '代码块',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'codeBlock',
        attrs: { language: 'javascript', code: '' }
      }).run();
    }
  }]
});
