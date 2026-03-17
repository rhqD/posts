'use client';

import { Editor } from '@tiptap/react';
import { Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3 } from 'lucide-react';
import { useEffect, useState } from 'react';

export function BubbleMenuComponent({ editor }: { editor: Editor }) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const updateMenu = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        setShow(false);
        return;
      }

      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(to);
      const left = (start.left + end.left) / 2;
      const top = start.top - 50;

      setPosition({ top, left });
      setShow(true);
    };

    editor.on('selectionUpdate', updateMenu);
    editor.on('update', updateMenu);

    return () => {
      editor.off('selectionUpdate', updateMenu);
      editor.off('update', updateMenu);
    };
  }, [editor]);

  if (!show) return null;

  return (
    <div
      className="fixed z-50 flex items-center gap-1 bg-gray-900 text-white rounded-lg shadow-lg p-1"
      style={{ top: `${position.top}px`, left: `${position.left}px`, transform: 'translateX(-50%)' }}
    >
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-2 rounded hover:bg-gray-700 ${editor.isActive('bold') ? 'bg-gray-700' : ''}`}
      >
        <Bold size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`p-2 rounded hover:bg-gray-700 ${editor.isActive('italic') ? 'bg-gray-700' : ''}`}
      >
        <Italic size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`p-2 rounded hover:bg-gray-700 ${editor.isActive('strike') ? 'bg-gray-700' : ''}`}
      >
        <Strikethrough size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`p-2 rounded hover:bg-gray-700 ${editor.isActive('code') ? 'bg-gray-700' : ''}`}
      >
        <Code size={16} />
      </button>
      <div className="w-px h-6 bg-gray-700 mx-1" />
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={`p-2 rounded hover:bg-gray-700 ${editor.isActive('heading', { level: 1 }) ? 'bg-gray-700' : ''}`}
      >
        <Heading1 size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`p-2 rounded hover:bg-gray-700 ${editor.isActive('heading', { level: 2 }) ? 'bg-gray-700' : ''}`}
      >
        <Heading2 size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`p-2 rounded hover:bg-gray-700 ${editor.isActive('heading', { level: 3 }) ? 'bg-gray-700' : ''}`}
      >
        <Heading3 size={16} />
      </button>
    </div>
  );
}
