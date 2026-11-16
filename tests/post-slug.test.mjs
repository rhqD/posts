import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/post-slug.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { validatePostSlug } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('snapshot and fallback slugs reject path traversal', () => {
  for (const slug of ['../../package', '../manifest', '/tmp/escape', '..\\escape', 'a/b', 'a%2fb', '%2e%2e', '.', '..', '', 'a\0b', 'safe\n', 'safe\r', 'a'.repeat(201)]) {
    assert.throws(() => validatePostSlug(slug), /Invalid post slug/);
  }
  for (const slug of ['safe-post_1', 'abc123', 'A'.repeat(200)]) validatePostSlug(slug);
});
