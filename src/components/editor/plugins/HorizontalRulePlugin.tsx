"use client";

import { useEffect, type ReactNode } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
  DecoratorNode,
  type SerializedLexicalNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type LexicalNode,
  $applyNodeReplacement,
} from "lexical";

export type SerializedHorizontalRuleNode = SerializedLexicalNode;

export class HorizontalRuleNode extends DecoratorNode<ReactNode> {
  static getType(): string {
    return "horizontalrule";
  }

  static clone(node: HorizontalRuleNode): HorizontalRuleNode {
    return new HorizontalRuleNode(node.__key);
  }

  createDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = "editor-hr-wrapper";
    return div;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    return { element: document.createElement("hr") };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      hr: () => ({
        conversion: (): DOMConversionOutput => ({ node: $createHorizontalRuleNode() }),
        priority: 0,
      }),
    };
  }

  static importJSON(): HorizontalRuleNode {
    return $createHorizontalRuleNode();
  }

  exportJSON(): SerializedHorizontalRuleNode {
    return { type: "horizontalrule", version: 1 };
  }

  getTextContent(): string {
    return "\n";
  }

  isInline(): false {
    return false;
  }

  decorate(): ReactNode {
    return <hr className="my-6 border-stone-200" />;
  }
}

export function $createHorizontalRuleNode(): HorizontalRuleNode {
  return $applyNodeReplacement(new HorizontalRuleNode());
}

export function $isHorizontalRuleNode(node: LexicalNode | null | undefined): node is HorizontalRuleNode {
  return node instanceof HorizontalRuleNode;
}

export const INSERT_HORIZONTAL_RULE_COMMAND: LexicalCommand<void> =
  createCommand("INSERT_HORIZONTAL_RULE_COMMAND");

export default function HorizontalRulePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      INSERT_HORIZONTAL_RULE_COMMAND,
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const hrNode = $createHorizontalRuleNode();
          selection.insertNodes([hrNode]);
          const paragraph = $createParagraphNode();
          hrNode.insertAfter(paragraph);
          paragraph.select();
        }
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  return null;
}
