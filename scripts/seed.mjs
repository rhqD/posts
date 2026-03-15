import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Load .env.local
const env = readFileSync(".env.local", "utf-8");
for (const line of env.split("\n")) {
  const [key, ...val] = line.split("=");
  if (key && val.length) process.env[key.trim()] = val.join("=").trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Categories ──────────────────────────────────────────────
const { data: cats, error: catErr } = await supabase
  .from("categories")
  .upsert([
    { name: "Technology", slug: "technology" },
    { name: "Design", slug: "design" },
    { name: "Life", slug: "life" },
  ], { onConflict: "slug" })
  .select();

if (catErr) { console.error("categories error:", catErr.message); process.exit(1); }

const catMap = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
console.log("✓ categories", catMap);

// ── Tags ─────────────────────────────────────────────────────
const { data: tags } = await supabase
  .from("tags")
  .upsert([
    { name: "Next.js", slug: "nextjs" },
    { name: "React", slug: "react" },
    { name: "TypeScript", slug: "typescript" },
    { name: "CSS", slug: "css" },
    { name: "AI", slug: "ai" },
    { name: "Productivity", slug: "productivity" },
  ], { onConflict: "slug" })
  .select();

const tagMap = Object.fromEntries(tags.map((t) => [t.slug, t.id]));
console.log("✓ tags", tagMap);

// ── Posts ─────────────────────────────────────────────────────
const posts = [
  {
    title: "Getting Started with Next.js 15",
    slug: "getting-started-nextjs-15",
    excerpt: "Next.js 15 brings a host of new features including improved caching, the new `use cache` directive, and better TypeScript support. Let's explore what's new.",
    content: `<h2>What's New in Next.js 15</h2>
<p>Next.js 15 is a major release that introduces several exciting features and improvements. The framework continues to push the boundaries of what's possible with React Server Components.</p>
<h3>The <code>use cache</code> Directive</h3>
<p>One of the most anticipated features is the new <code>use cache</code> directive, which gives you fine-grained control over caching behavior in your application.</p>
<pre><code class="language-typescript">async function getData() {
  "use cache";
  const data = await fetch("https://api.example.com/data");
  return data.json();
}</code></pre>
<h3>Improved Turbopack</h3>
<p>Turbopack has reached stability in Next.js 15, offering significantly faster build times compared to webpack. In our testing, cold starts are up to <strong>3x faster</strong> than previous versions.</p>
<h3>React 19 Support</h3>
<p>Full support for React 19 means you can now use all the new hooks and APIs including <code>useOptimistic</code>, <code>useFormStatus</code>, and the new <code>use</code> hook for reading promises and context.</p>
<blockquote><p>The combination of React 19 and Next.js 15 represents the most significant leap in developer experience we've seen in years.</p></blockquote>
<h2>Migration Guide</h2>
<p>Migrating from Next.js 14 is straightforward. The team has provided a codemod to handle most breaking changes automatically:</p>
<pre><code class="language-bash">npx @next/codemod@canary upgrade latest</code></pre>`,
    category_id: catMap["technology"],
    status: "published",
    published_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    tag_slugs: ["nextjs", "react", "typescript"],
  },
  {
    title: "Why I Switched to TypeScript (And Never Looked Back)",
    slug: "why-typescript",
    excerpt: "After years of writing plain JavaScript, I finally made the switch to TypeScript. Here's what I learned and why I'd never go back.",
    content: `<h2>The Reluctant Convert</h2>
<p>I'll admit it — I was one of those developers who rolled their eyes at TypeScript. "Just adds complexity," I said. "JavaScript is fine," I insisted. I was wrong.</p>
<h3>The Moment Everything Changed</h3>
<p>It was a routine refactor on a medium-sized codebase. I needed to rename a property that was used in about 40 different files. In JavaScript, this meant a risky find-and-replace and a prayer. In TypeScript, I renamed it once, and the compiler instantly showed me every single place that needed updating.</p>
<p>That was my <strong>aha moment</strong>.</p>
<h3>What TypeScript Actually Gives You</h3>
<ul>
<li><strong>Autocomplete that actually works</strong> — not just guessing based on usage patterns</li>
<li><strong>Refactoring confidence</strong> — change a type, fix all the errors</li>
<li><strong>Self-documenting code</strong> — function signatures tell you exactly what they expect</li>
<li><strong>Catch bugs at compile time</strong> — not in production at 2am</li>
</ul>
<h3>The Learning Curve is Overblown</h3>
<p>People often cite the learning curve as a reason to avoid TypeScript. But you can start with <code>strict: false</code> and gradually enable stricter checks as your team gets comfortable. You don't have to go all-in on day one.</p>
<pre><code class="language-json">{
  "compilerOptions": {
    "strict": false,
    "noImplicitAny": true
  }
}</code></pre>
<h2>My Recommendation</h2>
<p>If you're on the fence, just try it on your next side project. You'll be surprised how quickly it becomes second nature — and how much you miss it when you go back to plain JavaScript.</p>`,
    category_id: catMap["technology"],
    status: "published",
    published_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    tag_slugs: ["typescript"],
  },
  {
    title: "The Art of Minimal UI Design",
    slug: "minimal-ui-design",
    excerpt: "Minimalism in UI design isn't about removing things — it's about keeping only what matters. Here's how to think about stripping your interfaces down to their essence.",
    content: `<h2>Less Is More (But That's Hard)</h2>
<p>The irony of minimal design is that it's incredibly difficult to achieve. Anyone can add features. Taking them away requires real conviction.</p>
<p>Steve Jobs famously said that <strong>deciding what not to do is as important as deciding what to do</strong>. This applies as much to product features as it does to visual design.</p>
<h3>The Principles</h3>
<h4>1. Every element earns its place</h4>
<p>Before adding any UI element, ask: what would break if this wasn't here? If the answer is "nothing much," cut it.</p>
<h4>2. White space is not empty space</h4>
<p>Negative space guides the eye and gives content room to breathe. Dense interfaces feel anxious; spacious ones feel calm.</p>
<h4>3. Typography does the heavy lifting</h4>
<p>In a minimal design, typography isn't just text — it's structure, hierarchy, and emotion all at once. Invest time in choosing the right typefaces and sizes.</p>
<h3>Common Mistakes</h3>
<p>The most common mistake I see is <em>removing decoration without removing complexity</em>. A flat design with 15 competing elements is not minimal — it's just ugly.</p>
<blockquote><p>Minimalism is not a lack of something. It's simply the perfect amount of something. — Nicholas Burroughs</p></blockquote>
<h2>Practical Tips</h2>
<ul>
<li>Start with black and white, add color only when it carries meaning</li>
<li>Use a single typeface with varying weights instead of multiple families</li>
<li>Default to hiding secondary actions behind menus or hover states</li>
<li>When in doubt, increase padding</li>
</ul>`,
    category_id: catMap["design"],
    status: "published",
    published_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    tag_slugs: ["css"],
  },
  {
    title: "Building a Second Brain with Simple Tools",
    slug: "second-brain-simple-tools",
    excerpt: "You don't need an elaborate PKM system. Sometimes a few plain text files and a consistent habit beats any fancy app.",
    content: `<h2>The PKM Trap</h2>
<p>Personal Knowledge Management has become its own productivity industry. There are countless apps, methodologies, YouTube channels, and courses all promising to help you organize your thoughts and build a "second brain."</p>
<p>I fell for it. I spent more time organizing my notes than actually using them.</p>
<h3>What Actually Works</h3>
<p>After years of trying different systems, I've landed on something embarrassingly simple:</p>
<ul>
<li>A <code>notes/</code> folder with plain <code>.md</code> files</li>
<li>A daily note named by date (<code>2024-03-15.md</code>)</li>
<li>A weekly review on Sundays</li>
</ul>
<p>That's it. No tags, no backlinks, no graph view.</p>
<h3>The Weekly Review</h3>
<p>This is the one habit that ties everything together. Every Sunday, I spend 20 minutes:</p>
<ol>
<li>Reading through the week's daily notes</li>
<li>Moving anything worth keeping to a topic-based file</li>
<li>Writing 3 sentences about what I learned this week</li>
</ol>
<p>The act of reviewing forces consolidation. Notes you never revisit aren't knowledge — they're just digital clutter.</p>
<h3>The Right Tool</h3>
<p>I use <strong>Obsidian</strong> because it stores files as plain Markdown on disk. If Obsidian disappears tomorrow, my notes don't. Your tool should be a thin layer over your files, not a prison for them.</p>
<blockquote><p>The best PKM system is the one you'll actually use consistently.</p></blockquote>`,
    category_id: catMap["life"],
    status: "published",
    published_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    tag_slugs: ["productivity"],
  },
  {
    title: "How I Think About AI-Assisted Coding in 2025",
    slug: "ai-assisted-coding-2025",
    excerpt: "AI coding tools have matured significantly. Here's my honest take on what they're good at, where they fail, and how I've integrated them into my workflow.",
    content: `<h2>The Hype Has Settled</h2>
<p>A couple of years ago, headlines were screaming that AI would replace programmers within the year. That didn't happen. What did happen is more interesting: AI became a genuinely useful tool in the right hands.</p>
<h3>What AI Is Actually Good At</h3>
<p>After using AI coding assistants daily, here's my honest assessment:</p>
<p><strong>Great at:</strong></p>
<ul>
<li>Boilerplate and scaffolding — generating CRUD routes, form components, etc.</li>
<li>Explaining unfamiliar codebases</li>
<li>Writing tests for code you've already written</li>
<li>Translating between languages (Python to TypeScript, etc.)</li>
<li>Regex and one-off scripts</li>
</ul>
<p><strong>Still struggles with:</strong></p>
<ul>
<li>Complex architectural decisions</li>
<li>Debugging subtle race conditions or memory issues</li>
<li>Understanding your specific business domain</li>
<li>Anything requiring true creativity</li>
</ul>
<h3>My Workflow</h3>
<p>I think of AI as a very fast junior developer who knows every syntax and API but has no context about my project. My job is to provide that context, review the output critically, and make the real decisions.</p>
<pre><code class="language-typescript">// I write the interface and intent
interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

// AI fills in the implementation
// I review and adjust</code></pre>
<h3>The Skill That Matters Most</h3>
<p>The developers getting the most out of AI tools are those who can <strong>evaluate the output quickly and accurately</strong>. You still need to understand what good code looks like. AI doesn't make expertise obsolete — it makes expertise more leveraged.</p>`,
    category_id: catMap["technology"],
    status: "published",
    published_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    tag_slugs: ["ai", "productivity"],
  },
  {
    title: "CSS Grid vs Flexbox: When to Use Which",
    slug: "css-grid-vs-flexbox",
    excerpt: "Both CSS Grid and Flexbox are powerful layout tools, but they solve different problems. Here's a practical guide to choosing the right one.",
    content: `<h2>The One-Sentence Rule</h2>
<p>If you can remember one thing from this post, make it this:</p>
<blockquote><p><strong>Flexbox is for one-dimensional layouts. Grid is for two-dimensional layouts.</strong></p></blockquote>
<p>Everything else flows from this distinction.</p>
<h3>Flexbox: One Direction at a Time</h3>
<p>Flexbox is perfect when you're arranging items along a single axis — either a row or a column. Navigation bars, button groups, centering a single element, card content layout — all classic Flexbox territory.</p>
<pre><code class="language-css">.nav {
  display: flex;
  align-items: center;
  gap: 1rem;
}

/* Center anything */
.container {
  display: flex;
  align-items: center;
  justify-content: center;
}</code></pre>
<h3>Grid: Two Dimensions at Once</h3>
<p>CSS Grid shines when you need to control both rows and columns simultaneously. Page layouts, image galleries, dashboards — anywhere you're thinking about the whole canvas.</p>
<pre><code class="language-css">.layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: 64px 1fr auto;
  min-height: 100vh;
}

.sidebar { grid-row: 1 / -1; }
</code></pre>
<h3>They Work Great Together</h3>
<p>The best layouts often use Grid for the macro structure and Flexbox for the micro components within each area. Don't think of them as competing — think of them as complementary.</p>
<ul>
<li>Grid for the page shell (header, sidebar, main, footer)</li>
<li>Flexbox for the navbar items inside the header</li>
<li>Grid again for the card grid in main</li>
<li>Flexbox for the content inside each card</li>
</ul>`,
    category_id: catMap["design"],
    status: "published",
    published_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    tag_slugs: ["css"],
  },
];

for (const post of posts) {
  const { tag_slugs, ...postData } = post;

  const { data: inserted, error } = await supabase
    .from("posts")
    .upsert(postData, { onConflict: "slug" })
    .select()
    .single();

  if (error) {
    console.error("✗", post.slug, error.message);
    continue;
  }

  // attach tags
  if (tag_slugs.length) {
    await supabase.from("post_tags").delete().eq("post_id", inserted.id);
    await supabase.from("post_tags").insert(
      tag_slugs.map((s) => ({ post_id: inserted.id, tag_id: tagMap[s] }))
    );
  }

  console.log("✓ post:", inserted.title);
}

console.log("\nDone! 🎉");
