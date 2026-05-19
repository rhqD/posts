"use client";

import { useEffect, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { CodeNode, CodeHighlightNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { $generateNodesFromDOM } from "@lexical/html";
import { $getRoot, $insertNodes, type EditorState } from "lexical";

import theme from "./theme";
import { ImageNode } from "./nodes/ImageNode";
import { HorizontalRuleNode } from "./plugins/HorizontalRulePlugin";
import ToolbarPlugin from "./plugins/ToolbarPlugin";
import ImagePlugin from "./plugins/ImagePlugin";
import CodeHighlightPlugin from "./plugins/CodeHighlightPlugin";
import HorizontalRulePlugin from "./plugins/HorizontalRulePlugin";

interface LexicalEditorProps {
  content: string;
  onChange: (json: string) => void;
}

function isLexicalJSON(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return parsed?.root?.type === "root";
  } catch {
    return false;
  }
}

function InitialContentPlugin({ content }: { content: string }) {
  const [editor] = useLexicalComposerContext();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !content) return;
    initialized.current = true;

    if (isLexicalJSON(content)) {
      const state = editor.parseEditorState(content);
      editor.setEditorState(state);
    } else {
      // HTML content — import into Lexical
      editor.update(() => {
        const parser = new DOMParser();
        const dom = parser.parseFromString(content, "text/html");
        const nodes = $generateNodesFromDOM(editor, dom);
        const root = $getRoot();
        root.clear();
        $insertNodes(nodes);
      });
    }
  }, [editor, content]);

  return null;
}

function PlaceholderComponent() {
  return (
    <div className="absolute top-0 left-0 pointer-events-none text-stone-400 select-none">
      开始写作...
    </div>
  );
}

export default function LexicalEditor({ content, onChange }: LexicalEditorProps) {
  const initialConfig = {
    namespace: "BlogEditor",
    theme,
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      CodeNode,
      CodeHighlightNode,
      LinkNode,
      ImageNode,
      HorizontalRuleNode,
    ],
    onError: (error: Error) => {
      console.error("Lexical error:", error);
    },
  };

  const handleChange = (editorState: EditorState) => {
    const json = JSON.stringify(editorState.toJSON());
    onChange(json);
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="border border-stone-200 rounded-lg bg-white overflow-hidden">
        <ToolbarPlugin />
        <div className="relative px-6 py-4">
          <RichTextPlugin
            contentEditable={
              <ContentEditable className="lexical-editor outline-none min-h-[500px] font-serif text-base leading-relaxed text-[#37352F]" />
            }
            placeholder={<PlaceholderComponent />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <TabIndentationPlugin />
          <ImagePlugin />
          <CodeHighlightPlugin />
          <HorizontalRulePlugin />
          <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
          <InitialContentPlugin content={content} />
        </div>
      </div>
    </LexicalComposer>
  );
}

function LexicalErrorBoundary({ children, onError }: { children: React.ReactNode; onError: (e: Error) => void }) {
  return <ErrorBoundaryInner onError={onError}>{children}</ErrorBoundaryInner>;
}

import { Component, type ReactNode, type ErrorInfo } from "react";

class ErrorBoundaryInner extends Component<
  { children: ReactNode; onError: (e: Error) => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Lexical ErrorBoundary:", error, errorInfo);
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return <div className="text-red-500 p-4">Something went wrong with the editor.</div>;
    }
    return this.props.children;
  }
}
