'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Category, Tag } from "@/lib/supabase/types";

const TiptapEditor = dynamic(() => import("@/components/editor/TiptapEditor"), { ssr: false });

interface PostFormProps {
  postId?: string;
  initialData?: {
    title: string;
    excerpt: string;
    content: string;
    category_id: string | null;
    status: "draft" | "published";
    tag_ids: string[];
  };
  categories: Category[];
  tags: Tag[];
}

export default function PostForm({ postId, initialData, categories, tags }: PostFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [excerpt, setExcerpt] = useState(initialData?.excerpt ?? "");
  const [content, setContent] = useState(initialData?.content ?? "");
  const [categoryId, setCategoryId] = useState(initialData?.category_id ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(initialData?.tag_ids ?? []);
  const [saving, setSaving] = useState(false);

  async function handleSave(status: "draft" | "published") {
    setSaving(true);
    const body = { title, excerpt, content, category_id: categoryId || null, status, tag_ids: selectedTags };
    const url = postId ? `/api/posts/${postId}` : "/api/posts";
    const method = postId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      router.push("/admin/posts");
      router.refresh();
    } else {
      alert("Failed to save post");
    }
  }

  function toggleTag(id: string) {
    setSelectedTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-4">
        <input
          type="text"
          placeholder="Post title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-2xl font-bold border-0 border-b border-gray-200 pb-2 focus:outline-none focus:border-gray-400"
        />
        <textarea
          placeholder="Excerpt (optional)"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          rows={2}
          className="w-full text-sm border border-gray-200 rounded-lg p-3 focus:outline-none focus:border-gray-400 resize-none"
        />
        <TiptapEditor content={content} onChange={setContent} />
      </div>
      <div className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="font-medium text-sm">Publish</h3>
          <div className="flex gap-2">
            <button
              onClick={() => handleSave("draft")}
              disabled={saving}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:border-gray-400 disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              onClick={() => handleSave("published")}
              disabled={saving || !title}
              className="flex-1 px-3 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              Publish
            </button>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="font-medium text-sm">Category</h3>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none"
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h3 className="font-medium text-sm">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`text-xs px-2 py-1 rounded-full border ${
                  selectedTags.includes(tag.id)
                    ? "bg-gray-900 text-white border-gray-900"
                    : "border-gray-200 hover:border-gray-400"
                }`}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
