import { Command, createSuggestionItems, renderItems } from "novel";
import { uploadFn } from "./image-upload";

export const suggestionItems = createSuggestionItems([
  {
    title: "Text",
    description: "Just start typing with plain text.",
    searchTerms: ["p", "paragraph"],
    icon: <span>¶</span>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleNode("paragraph", "paragraph").run();
    },
  },
  {
    title: "Heading 1",
    description: "Big section heading.",
    searchTerms: ["title", "big", "large"],
    icon: <span>H1</span>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading.",
    searchTerms: ["subtitle", "medium"],
    icon: <span>H2</span>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading.",
    searchTerms: ["subtitle", "small"],
    icon: <span>H3</span>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Create a simple bullet list.",
    searchTerms: ["unordered", "point"],
    icon: <span>•</span>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Create a list with numbering.",
    searchTerms: ["ordered"],
    icon: <span>1.</span>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Code Block",
    description: "Capture a code snippet.",
    searchTerms: ["codeblock"],
    icon: <span>{`</>`}</span>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "Image",
    description: "Upload an image from your computer.",
    searchTerms: ["photo", "picture", "media"],
    icon: <span>🖼</span>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        if (input.files?.length) {
          const file = input.files[0];
          const url = await uploadFn(file);
          if (url) editor.chain().focus().setImage({ src: url }).run();
        }
      };
      input.click();
    },
  },
  {
    title: "LaTeX Formula",
    description: "Insert a mathematical formula.",
    searchTerms: ["math", "katex", "equation"],
    icon: <span>∑</span>,
    command: ({ editor, range }) => {
      const formula = prompt("Enter LaTeX formula:");
      if (formula) {
        editor.chain().focus().deleteRange(range).insertContent({ type: "katex", attrs: { formula } }).run();
      }
    },
  },
  {
    title: "Mermaid Diagram",
    description: "Create a flowchart or diagram.",
    searchTerms: ["flowchart", "diagram", "chart"],
    icon: <span>📊</span>,
    command: ({ editor, range }) => {
      const code = prompt("Enter Mermaid code:");
      if (code) {
        editor.chain().focus().deleteRange(range).insertContent({ type: "mermaid", attrs: { code } }).run();
      }
    },
  },
]);

export const slashCommand = Command.configure({
  suggestion: {
    items: () => suggestionItems,
    render: renderItems,
  },
});
