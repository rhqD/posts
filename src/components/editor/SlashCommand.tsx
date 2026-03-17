import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import { CommandList } from './CommandList';

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: any) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

export const suggestion = {
  items: ({ query }: { query: string }) => {
    return [
      {
        title: 'Heading 1',
        description: '大标题',
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run();
        }
      },
      {
        title: 'Heading 2',
        description: '中标题',
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run();
        }
      },
      {
        title: 'Heading 3',
        description: '小标题',
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run();
        }
      },
      {
        title: 'Bullet List',
        description: '无序列表',
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).toggleBulletList().run();
        }
      },
      {
        title: 'Numbered List',
        description: '有序列表',
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).toggleOrderedList().run();
        }
      },
      {
        title: 'Code Block',
        description: '代码块',
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
        }
      },
      {
        title: 'Image',
        description: '上传图片',
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).run();
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = async () => {
            if (input.files?.length) {
              const file = input.files[0];
              const formData = new FormData();
              formData.append('file', file);
              const res = await fetch('/api/upload', { method: 'POST', body: formData });
              const { url } = await res.json();
              if (url) editor.chain().focus().setImage({ src: url }).run();
            }
          };
          input.click();
        }
      },
      {
        title: 'Inline Math',
        description: '行内公式',
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).insertContent({ type: 'inlineKatex', attrs: { formula: '' } }).run();
        }
      },
      {
        title: 'Formula',
        description: '块级公式',
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).insertContent({ type: 'katex', attrs: { formula: '' } }).run();
        }
      },
      {
        title: 'Mermaid Diagram',
        description: '流程图/图表',
        command: ({ editor, range }: any) => {
          editor.chain().focus().deleteRange(range).run();
          const code = prompt('输入 Mermaid 代码:');
          if (code) {
            editor.chain().focus().insertContent({ type: 'mermaid', attrs: { code } }).run();
          }
        }
      },
    ].filter(item => item.title.toLowerCase().includes(query.toLowerCase()));
  },

  render: () => {
    let component: ReactRenderer;
    let popup: any;

    return {
      onStart: (props: any) => {
        component = new ReactRenderer(CommandList, {
          props,
          editor: props.editor,
        });

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        });
      },

      onUpdate(props: any) {
        component.updateProps(props);
        popup[0].setProps({
          getReferenceClientRect: props.clientRect,
        });
      },

      onKeyDown(props: any) {
        if (props.event.key === 'Escape') {
          popup[0].hide();
          return true;
        }
        return component.ref?.onKeyDown(props);
      },

      onExit() {
        popup[0].destroy();
        component.destroy();
      },
    };
  },
};
