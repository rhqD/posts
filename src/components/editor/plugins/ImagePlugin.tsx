"use client";

import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $insertNodes,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
} from "lexical";
import { $createImageNode, ImageNode } from "../nodes/ImageNode";

export type InsertImagePayload = { src: string; alt: string };

export const INSERT_IMAGE_COMMAND: LexicalCommand<InsertImagePayload> =
  createCommand("INSERT_IMAGE_COMMAND");

export default function ImagePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([ImageNode])) {
      throw new Error("ImagePlugin: ImageNode not registered in editor");
    }

    const unregister = editor.registerCommand(
      INSERT_IMAGE_COMMAND,
      (payload) => {
        const imageNode = $createImageNode(payload);
        $insertNodes([imageNode]);
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );

    return unregister;
  }, [editor]);

  useEffect(() => {
    const removeListener = editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement) {
        prevRootElement.removeEventListener("drop", handleDrop);
        prevRootElement.removeEventListener("dragover", handleDragOver);
      }
      if (rootElement) {
        rootElement.addEventListener("drop", handleDrop);
        rootElement.addEventListener("dragover", handleDragOver);
      }
    });

    function handleDragOver(e: DragEvent) {
      const hasFiles = e.dataTransfer?.types.includes("Files");
      if (hasFiles) {
        e.preventDefault();
      }
    }

    async function handleDrop(e: DragEvent) {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!file.type.startsWith("image/")) return;

      e.preventDefault();

      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const { url } = await res.json();
        editor.dispatchCommand(INSERT_IMAGE_COMMAND, { src: url, alt: file.name });
      }
    }

    return removeListener;
  }, [editor]);

  return null;
}
