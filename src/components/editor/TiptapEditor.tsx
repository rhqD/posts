'use client';

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Placeholder from "@tiptap/extension-placeholder";
import { common, createLowlight } from "lowlight";
import { useRef } from "react";
import { KatexExtension, InlineKatexExtension, MermaidExtension } from "./extensions";
import { SlashCommand, suggestion } from "./SlashCommand";
import { BubbleMenuComponent } from "./BubbleMenuComponent";

const lowlight = createLowlight(common);

interface TiptapEditorProps {
  content: string;
  onChange: (html: string) => void;
}

export default function TiptapEditor({ content, onChange }: TiptapEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Image,
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({
        placeholder: "输入 / 唤起菜单，或开始写作...",
      }),
      KatexExtension,
      InlineKatexExtension,
      MermaidExtension,
      SlashCommand.configure({ suggestion }),
    ],
    content,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-gray max-w-none focus:outline-none min-h-[500px] px-16 py-12",
      },
    },
  });

  if (!editor) return null;

  return (
    <div className="relative bg-white">
      <BubbleMenuComponent editor={editor} />
      <EditorContent editor={editor} />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" />
    </div>
  );
}
