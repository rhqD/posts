# 编辑器底层数据结构

## 1. ProseMirror 文档模型

Tiptap 基于 ProseMirror，使用 **树状 JSON 结构** 存储文档：

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 1 },
      "content": [{ "type": "text", "text": "标题" }]
    },
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "段落内容" }]
    },
    {
      "type": "codeBlock",
      "attrs": { "language": "javascript", "code": "console.log('hello')" }
    }
  ]
}
```

## 2. 节点类型

### Block 节点（块级）
```typescript
{
  name: "codeBlock",
  group: "block",        // 块级元素
  content: "text*",      // 可包含文本
  attrs: { ... }         // 自定义属性
}
```

### Inline 节点（行内）
```typescript
{
  name: "inlineKatex",
  group: "inline",       // 行内元素
  inline: true,
  atom: true,           // 原子节点，不可分割
  attrs: { formula: "" }
}
```

### Container 节点（容器）
```typescript
{
  name: "columns",
  group: "block",
  content: "block+",    // 可嵌套多个块级元素
  attrs: { columns: 2 }
}
```

## 3. 实际存储示例

### 多列布局的 JSON
```json
{
  "type": "columns",
  "attrs": { "columns": 2 },
  "content": [
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "左列内容" }]
    },
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "右列内容" }]
    }
  ]
}
```

### 对应的 HTML（存储到数据库）
```html
<div data-columns="2" class="columns">
  <p>左列内容</p>
  <p>右列内容</p>
</div>
```

### Callout 的 JSON
```json
{
  "type": "callout",
  "attrs": { "type": "warning" },
  "content": [
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "警告信息" }]
    }
  ]
}
```

## 4. 扩展性的关键

### Schema 定义
每个扩展通过 `parseHTML` 和 `renderHTML` 定义转换规则：

```typescript
parseHTML() {
  return [{
    tag: "div[data-columns]",
    getAttrs: (dom) => ({
      columns: dom.getAttribute("data-columns")
    })
  }];
}

renderHTML({ node }) {
  return ["div", {
    "data-columns": node.attrs.columns
  }, 0];  // 0 表示插入 content
}
```

### 为什么这样设计可扩展？

1. **独立的 Schema**：每个扩展定义自己的数据结构
2. **统一的接口**：都遵循 `type` + `attrs` + `content` 模式
3. **HTML 作为中间格式**：存储时序列化为 HTML，加载时解析回 JSON
4. **自定义属性**：通过 `data-*` 属性存储元数据

## 6. 对比其他编辑器

### Notion 的数据结构
```json
{
  "id": "block-uuid",
  "type": "column_list",
  "children": [
    { "id": "col-1", "type": "column", "children": [...] },
    { "id": "col-2", "type": "column", "children": [...] }
  ]
}
```
- ✅ 每个块有唯一 ID，便于引用
- ❌ 专有格式，难以迁移
- ❌ 需要后端支持块级操作

### Slate.js 的数据结构
```json
[
  {
    "type": "paragraph",
    "children": [{ "text": "内容" }]
  }
]
```
- ✅ 纯 JSON，灵活
- ❌ 没有标准序列化格式
- ❌ 需要自己实现 HTML 转换

### Draft.js (已废弃)
```json
{
  "blocks": [...],
  "entityMap": {...}
}
```
- ❌ 复杂的 entity 系统
- ❌ 不支持嵌套块

### 我们的方案 (Tiptap/ProseMirror)
```
JSON ←→ HTML ←→ 数据库
```
- ✅ HTML 作为通用格式，易于迁移
- ✅ 支持任意嵌套结构
- ✅ 扩展通过 Schema 自动处理转换
- ✅ 可直接在前端渲染 HTML（博客展示）

## 7. 为什么选择 HTML 存储？

1. **通用性**：任何前端框架都能渲染
2. **SEO 友好**：直接输出到页面
3. **可读性**：人类可读，便于调试
4. **向后兼容**：新增扩展不影响旧数据
5. **迁移简单**：可导出为 Markdown/PDF

## 8. 扩展新元素的完整流程

```typescript
// 1. 定义数据结构
Node.create({
  name: "video",
  attrs: { src: "", width: "100%" }
})

// 2. 定义 HTML 映射
parseHTML: [{ tag: "video" }]
renderHTML: ["video", { src: node.attrs.src }]

// 3. 定义 React 渲染
addNodeView: ReactNodeViewRenderer(VideoView)

// 4. 注册到系统
registerExtension({ extension: VideoExtension })
```

数据自动在 JSON ↔ HTML ↔ React 之间转换，无需手动处理。

```
用户编辑
   ↓
ProseMirror State (JSON Tree)
   ↓
editor.getHTML() → HTML String
   ↓
存储到 Supabase (posts.content)
   ↓
读取后 editor.setContent(html)
   ↓
parseHTML 解析回 JSON
   ↓
ReactNodeViewRenderer 渲染组件
```
