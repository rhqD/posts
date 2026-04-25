# 编辑器扩展系统

## 如何添加新扩展

### 1. 创建扩展文件

在 `extensions/` 目录下创建新文件，例如 `VideoExtension.tsx`：

```tsx
import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { registerExtension } from './registry';

function VideoView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper>
      <video src={node.attrs.src} controls className="w-full" />
    </NodeViewWrapper>
  );
}

export const VideoExtension = Node.create({
  name: "video",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "video" }];
  },

  renderHTML({ node }) {
    return ["video", { src: node.attrs.src, controls: true }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoView);
  },
});

registerExtension({
  extension: VideoExtension,
  slashCommands: [{
    title: 'Video',
    description: '插入视频',
    command: ({ editor, range }) => {
      const src = prompt('输入视频URL:');
      if (src) {
        editor.chain().focus().deleteRange(range).insertContent({
          type: 'video',
          attrs: { src }
        }).run();
      }
    }
  }]
});
```

### 2. 在 index.ts 中导入

编辑 `extensions/index.ts`：

```ts
import "./VideoExtension";  // 添加这一行
```

### 3. 完成

扩展会自动注册到编辑器，slash 命令也会自动出现在菜单中。

## 布局扩展

布局扩展使用 `content: "block+"` 允许嵌套内容，配合 `NodeViewContent` 渲染：

```tsx
export const LayoutExtension = Node.create({
  name: "layout",
  group: "block",
  content: "block+",  // 允许嵌套块级内容

  addNodeView() {
    return ReactNodeViewRenderer(LayoutView);
  },
});

function LayoutView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper>
      <div className="layout-container">
        <NodeViewContent />  {/* 渲染嵌套内容 */}
      </div>
    </NodeViewWrapper>
  );
}
```

示例：`ColumnsExtension.tsx`（多列）、`CalloutExtension.tsx`（提示框）

## 扩展系统特性

- ✅ 插件化架构：每个扩展独立文件
- ✅ 自动注册：导入即可使用
- ✅ Slash 命令集成：扩展可声明自己的命令
- ✅ 零配置：无需修改 TiptapEditor.tsx
- ✅ 支持布局：可嵌套内容的容器扩展
