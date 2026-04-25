'use client';

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { useRef } from "react";
import { getExtensions } from "./extensions";
import { SlashCommand, suggestion } from "./SlashCommand";
import { BubbleMenuComponent } from "./BubbleMenuComponent";
import { getEditorClass, type EditorLayout } from "./layout";

interface TiptapEditorProps {
  content: string;
  onChange: (html: string) => void;
  layout?: EditorLayout;
}

export default function TiptapEditor({ content, onChange, layout }: TiptapEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Image,
      Placeholder.configure({
        placeholder: "输入 / 唤起菜单，或开始写作...",
      }),
      ...getExtensions(),
      SlashCommand.configure({ suggestion }),
    ],
    content,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: getEditorClass(layout),
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
