import type { ReactNode } from "react";
import {
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
  $applyNodeReplacement,
} from "lexical";

export type SerializedImageNode = Spread<
  { src: string; alt: string; width?: number; height?: number },
  SerializedLexicalNode
>;

function $convertImageElement(domNode: Node): DOMConversionOutput | null {
  const img = domNode as HTMLImageElement;
  if (img.src) {
    const node = $createImageNode({
      src: img.src,
      alt: img.alt || "",
      width: img.width || undefined,
      height: img.height || undefined,
    });
    return { node };
  }
  return null;
}

export class ImageNode extends DecoratorNode<ReactNode> {
  __src: string;
  __alt: string;
  __width: number | undefined;
  __height: number | undefined;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__src, node.__alt, node.__width, node.__height, node.__key);
  }

  constructor(src: string, alt: string, width?: number, height?: number, key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__alt = alt;
    this.__width = width;
    this.__height = height;
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "editor-image-wrapper";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const img = document.createElement("img");
    img.src = this.__src;
    img.alt = this.__alt;
    if (this.__width) img.width = this.__width;
    if (this.__height) img.height = this.__height;
    return { element: img };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: $convertImageElement,
        priority: 0,
      }),
    };
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    return $createImageNode({
      src: serializedNode.src,
      alt: serializedNode.alt,
      width: serializedNode.width,
      height: serializedNode.height,
    });
  }

  exportJSON(): SerializedImageNode {
    return {
      type: "image",
      version: 1,
      src: this.__src,
      alt: this.__alt,
      width: this.__width,
      height: this.__height,
    };
  }

  decorate(): ReactNode {
    return (
      <img
        src={this.__src}
        alt={this.__alt}
        width={this.__width}
        height={this.__height}
        className="max-w-full h-auto rounded-md my-4"
        draggable={false}
      />
    );
  }
}

export function $createImageNode({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}): ImageNode {
  return $applyNodeReplacement(new ImageNode(src, alt, width, height));
}

export function $isImageNode(node: LexicalNode | null | undefined): node is ImageNode {
  return node instanceof ImageNode;
}
