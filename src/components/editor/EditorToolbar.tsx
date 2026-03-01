'use client';

import { Editor } from "@tiptap/react";
import {
  Bold, Italic, Code, Heading2, Heading3, List, ListOrdered,
  Quote, Minus, Image, Calculator, GitBranch, Undo, Redo
} from "lucide-react";

interface EditorToolbarProps {
  editor: Editor;
  onImageUpload: () => void;
  onInsertKatex: () => void;
  onInsertMermaid: () => void;
}

const ToolbarButton = ({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded hover:bg-gray-100 ${active ? "bg-gray-200" : ""}`}
  >
    {children}
  </button>
);

export default function EditorToolbar({
  editor,
  onImageUpload,
  onInsertKatex,
  onInsertMermaid,
}: EditorToolbarProps) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200 p-2">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold"
      >
        <Bold size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic"
      >
        <Italic size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
        title="Inline code"
      >
        <Code size={16} />
      </ToolbarButton>
      <div className="w-px bg-gray-200 mx-1" />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <Heading2 size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <Heading3 size={16} />
      </ToolbarButton>
      <div className="w-px bg-gray-200 mx-1" />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Bullet list"
      >
        <List size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Ordered list"
      >
        <ListOrdered size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        title="Blockquote"
      >
        <Quote size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal rule"
      >
        <Minus size={16} />
      </ToolbarButton>
      <div className="w-px bg-gray-200 mx-1" />
      <ToolbarButton onClick={onImageUpload} title="Insert image">
        <Image size={16} />
      </ToolbarButton>
      <ToolbarButton onClick={onInsertKatex} title="Insert math formula">
        <Calculator size={16} />
      </ToolbarButton>
      <ToolbarButton onClick={onInsertMermaid} title="Insert diagram">
        <GitBranch size={16} />
      </ToolbarButton>
      <div className="w-px bg-gray-200 mx-1" />
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        title="Undo"
      >
        <Undo size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        title="Redo"
      >
        <Redo size={16} />
      </ToolbarButton>
    </div>
  );
}
