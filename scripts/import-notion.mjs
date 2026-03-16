import { createClient } from '@supabase/supabase-js';
import { NotionToMarkdown } from 'notion-to-md';
import { Client } from '@notionhq/client';
import { marked } from 'marked';
import { readFileSync } from 'fs';

// Load .env.local
const envContent = readFileSync('.env.local', 'utf-8');
envContent.split('\n').forEach(line => {
  const [key, ...values] = line.split('=');
  if (key && values.length) process.env[key] = values.join('=');
});

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const n2m = new NotionToMarkdown({ notionClient: notion });

// 自定义 equation 块转换器，保留 LaTeX
n2m.setCustomTransformer('equation', async (block) => {
  const { equation } = block;
  return `$$\n${equation.expression}\n$$`;
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 机器学习文章的 page IDs
const pageIds = [
  '2adc53874c4e8023a307d0514db1da64', // 机器学习 -
  '2adc53874c4e8087b92fc473cdbd7b34', // 机器学习 - 逻辑回归
  '2adc53874c4e80b299abee61f4955048', // 机器学习 - 线性回归
  '2d0c53874c4e80ef9cf9f37067c007e7', // 机器学习 - 符号化求导
];

async function importPost(pageId) {
  // 获取页面元数据
  const page = await notion.pages.retrieve({ page_id: pageId });
  const title = page.properties.title.title[0]?.plain_text || 'Untitled';
  const date = page.properties.date?.date?.start || new Date().toISOString().split('T')[0];

  // 获取内容并转换为 Markdown
  const mdblocks = await n2m.pageToMarkdown(pageId);
  const mdString = n2m.toMarkdownString(mdblocks);

  // Markdown 转 HTML
  let content = marked.parse(mdString.parent);

  // 转换块级 LaTeX 公式
  content = content.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
    return `<div class="katex-block" data-formula="${formula.trim()}"></div>`;
  });

  // 转换行内 LaTeX 公式
  content = content.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
    return `<span class="katex-inline" data-formula="${formula.trim()}"></span>`;
  });

  // 使用 pageId 作为 slug（去掉连字符）
  const slug = pageId.replace(/-/g, '');

  // 插入到 Supabase
  const { data, error } = await supabase.from('posts').insert({
    title,
    slug,
    content,
    excerpt: content.substring(0, 200).replace(/<[^>]*>/g, ''),
    status: 'published',
    published_at: date + 'T00:00:00Z',
  });

  if (error) console.error(`Failed to import "${title}":`, error);
  else console.log(`✓ Imported: ${title}`);
}

for (const id of pageIds) {
  await importPost(id);
}
