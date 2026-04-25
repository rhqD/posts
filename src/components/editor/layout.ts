export interface EditorLayout {
  width?: 'narrow' | 'medium' | 'wide' | 'full';
  padding?: 'none' | 'small' | 'medium' | 'large';
  minHeight?: string;
  theme?: 'light' | 'dark';
}

const layoutPresets = {
  width: {
    narrow: 'max-w-2xl mx-auto',
    medium: 'max-w-4xl mx-auto',
    wide: 'max-w-6xl mx-auto',
    full: 'max-w-none',
  },
  padding: {
    none: 'p-0',
    small: 'px-8 py-6',
    medium: 'px-16 py-12',
    large: 'px-24 py-16',
  },
};

export function getEditorClass(layout: EditorLayout = {}) {
  const {
    width = 'medium',
    padding = 'medium',
    minHeight = '500px',
  } = layout;

  return `prose prose-gray focus:outline-none ${layoutPresets.width[width]} ${layoutPresets.padding[padding]} min-h-[${minHeight}]`;
}
