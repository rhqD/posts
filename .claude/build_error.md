# Vercel构建失败 - 需要修复

## 错误信息
TypeScript编译错误：
文件：src/components/editor/extensions/InlineKatexExtension.tsx
行号：70
错误：Argument of type 'number | undefined' is not assignable to parameter of type 'number | Range'

## 问题代码
```typescript
const pos = getPos();
editor.commands.focus();
editor.commands.setTextSelection(pos);  // 这里出错
```

## 问题分析
1. `getPos()`函数返回`number | undefined`
2. `setTextSelection()`方法期望`number | Range`
3. 当`getPos()`返回`undefined`时，TypeScript报错

## 需要修复
请修复这个TypeScript类型错误，确保代码能通过编译。

## 相关代码位置
文件中还有另一处相同问题（第76行）也需要修复。
