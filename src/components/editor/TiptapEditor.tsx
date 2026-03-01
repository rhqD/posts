'use client';

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { useRef } from "react";
import EditorToolbar from "./EditorToolbar";
import { KatexExtension, MermaidExtension } from "./extensions";

const lowlight = createLowlight(common);

interface TiptapEditorProps {
  content: string;
  onChange: (html: string) => void;
}

export default function TiptapEditor({ content, onChange }: TiptapEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Image,
      CodeBlockLowlight.configure({ lowlight }),
      KatexExtension,
      MermaidExtension,
    ],
    content,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-gray max-w-none p-4 focus:outline-none min-h-[400px]",
      },
    },
  });

  if (!editor) return null;

  async function handleImageUpload() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const { url } = await res.json();
    if (url) editor.chain().focus().setImage({ src: url }).run();
    e.target.value = "";
  }

  function handleInsertKatex() {
    const formula = prompt("Enter LaTeX formula:");
    if (formula && editor) {
      editor.chain().focus().insertContent({ type: "katex", attrs: { formula } }).run();
    }
  }

  function handleInsertMermaid() {
    const code = prompt("Enter Mermaid diagram code:");
    if (code && editor) {
      editor.chain().focus().insertContent({ type: "mermaid", attrs: { code } }).run();
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <EditorToolbar
        editor={editor}
        onImageUpload={handleImageUpload}
        onInsertKatex={handleInsertKatex}
        onInsertMermaid={handleInsertMermaid}
      />
      <EditorContent editor={editor} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
