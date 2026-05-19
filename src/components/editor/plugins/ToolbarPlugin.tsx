"use client";

import { useCallback, useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  SELECTION_CHANGE_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  type TextFormatType,
} from "lexical";
import { $setBlocksType } from "@lexical/selection";
import { $createHeadingNode, $createQuoteNode, $isHeadingNode, type HeadingTagType } from "@lexical/rich-text";
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, $isListNode } from "@lexical/list";
import { $createCodeNode, $isCodeNode } from "@lexical/code";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "./HorizontalRulePlugin";
import { INSERT_IMAGE_COMMAND } from "./ImagePlugin";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  CodeSquare,
  Minus,
  ImagePlus,
  Undo,
  Redo,
} from "lucide-react";

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded hover:bg-stone-200 disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? "bg-stone-200 text-stone-900" : "text-stone-600"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-stone-200 mx-1" />;
}

export default function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [blockType, setBlockType] = useState<string>("paragraph");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));
      setIsCode(selection.hasFormat("code"));

      const anchorNode = selection.anchor.getNode();
      const element =
        anchorNode.getKey() === "root"
          ? anchorNode
          : anchorNode.getTopLevelElementOrThrow();

      if ($isHeadingNode(element)) {
        setBlockType(element.getTag());
      } else if ($isListNode(element)) {
        setBlockType(element.getListType());
      } else if ($isCodeNode(element)) {
        setBlockType("code");
      } else {
        setBlockType(element.getType());
      }
    }
  }, []);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        $updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );
  }, [editor, $updateToolbar]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload) => {
        setCanUndo(payload);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload) => {
        setCanRedo(payload);
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    );
  }, [editor]);

  const formatText = (format: TextFormatType) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const formatHeading = (tag: HeadingTagType) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (blockType === tag) {
          $setBlocksType(selection, () => $createParagraphNode());
        } else {
          $setBlocksType(selection, () => $createHeadingNode(tag));
        }
      }
    });
  };

  const formatQuote = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (blockType === "quote") {
          $setBlocksType(selection, () => $createParagraphNode());
        } else {
          $setBlocksType(selection, () => $createQuoteNode());
        }
      }
    });
  };

  const formatCode = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (blockType === "code") {
          $setBlocksType(selection, () => $createParagraphNode());
        } else {
          $setBlocksType(selection, () => $createCodeNode());
        }
      }
    });
  };

  const insertImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const { url } = await res.json();
        editor.dispatchCommand(INSERT_IMAGE_COMMAND, { src: url, alt: file.name });
      }
    };
    input.click();
  };

  const sz = 16;

  return (
    <div className="flex items-center gap-0.5 border-b border-stone-200 px-2 py-1.5 flex-wrap">
      <ToolbarButton onClick={() => formatText("bold")} active={isBold} title="Bold">
        <Bold size={sz} />
      </ToolbarButton>
      <ToolbarButton onClick={() => formatText("italic")} active={isItalic} title="Italic">
        <Italic size={sz} />
      </ToolbarButton>
      <ToolbarButton onClick={() => formatText("strikethrough")} active={isStrikethrough} title="Strikethrough">
        <Strikethrough size={sz} />
      </ToolbarButton>
      <ToolbarButton onClick={() => formatText("code")} active={isCode} title="Inline Code">
        <Code size={sz} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton onClick={() => formatHeading("h1")} active={blockType === "h1"} title="Heading 1">
        <Heading1 size={sz} />
      </ToolbarButton>
      <ToolbarButton onClick={() => formatHeading("h2")} active={blockType === "h2"} title="Heading 2">
        <Heading2 size={sz} />
      </ToolbarButton>
      <ToolbarButton onClick={() => formatHeading("h3")} active={blockType === "h3"} title="Heading 3">
        <Heading3 size={sz} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
        active={blockType === "bullet"}
        title="Bullet List"
      >
        <List size={sz} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
        active={blockType === "number"}
        title="Ordered List"
      >
        <ListOrdered size={sz} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton onClick={formatQuote} active={blockType === "quote"} title="Block Quote">
        <Quote size={sz} />
      </ToolbarButton>
      <ToolbarButton onClick={formatCode} active={blockType === "code"} title="Code Block">
        <CodeSquare size={sz} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}
        title="Horizontal Rule"
      >
        <Minus size={sz} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton onClick={insertImage} title="Insert Image">
        <ImagePlus size={sz} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} disabled={!canUndo} title="Undo">
        <Undo size={sz} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} disabled={!canRedo} title="Redo">
        <Redo size={sz} />
      </ToolbarButton>
    </div>
  );
}
