import type { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/react';

export interface SlashCommandItem {
  title: string;
  description: string;
  command: (props: { editor: Editor; range: any }) => void;
}

export interface ExtensionPlugin {
  extension: Extension;
  slashCommands?: SlashCommandItem[];
}

export const extensionRegistry: ExtensionPlugin[] = [];

export function registerExtension(plugin: ExtensionPlugin) {
  extensionRegistry.push(plugin);
}

export function getExtensions() {
  return extensionRegistry.map(p => p.extension);
}

export function getSlashCommands() {
  return extensionRegistry.flatMap(p => p.slashCommands || []);
}
