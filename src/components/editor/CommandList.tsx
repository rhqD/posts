'use client';

import { forwardRef, useEffect, useImperativeHandle, useState, useRef } from 'react';
import { Heading1, Heading2, Heading3, List, ListOrdered, Code, Image, FunctionSquare, Workflow, Sigma } from 'lucide-react';

const iconMap: Record<string, any> = {
  'Heading 1': Heading1,
  'Heading 2': Heading2,
  'Heading 3': Heading3,
  'Bullet List': List,
  'Numbered List': ListOrdered,
  'Code Block': Code,
  'Image': Image,
  'Inline Math': Sigma,
  'Formula': FunctionSquare,
  'Mermaid Diagram': Workflow,
};

export const CommandList = forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command(item);
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: any) => {
      if (event.key === 'ArrowUp') {
        const newIndex = (selectedIndex + props.items.length - 1) % props.items.length;
        setSelectedIndex(newIndex);
        itemRefs.current[newIndex]?.scrollIntoView({ block: 'nearest' });
        return true;
      }
      if (event.key === 'ArrowDown') {
        const newIndex = (selectedIndex + 1) % props.items.length;
        setSelectedIndex(newIndex);
        itemRefs.current[newIndex]?.scrollIntoView({ block: 'nearest' });
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  useEffect(() => setSelectedIndex(0), [props.items]);

  return (
    <div className="bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-[280px] max-h-[400px] overflow-auto">
      {props.items.length === 0 ? (
        <div className="px-4 py-3 text-sm text-gray-400">无匹配项</div>
      ) : (
        props.items.map((item: any, index: number) => {
          const Icon = iconMap[item.title];
          return (
            <button
              key={index}
              ref={(el) => { itemRefs.current[index] = el; }}
              onClick={() => selectItem(index)}
              className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                index === selectedIndex ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'
              }`}
            >
              {Icon && (
                <div className={`flex-shrink-0 ${index === selectedIndex ? 'text-blue-600' : 'text-gray-400'}`}>
                  <Icon size={18} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{item.title}</div>
                {item.description && (
                  <div className="text-xs text-gray-500 truncate">{item.description}</div>
                )}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
});

CommandList.displayName = 'CommandList';
