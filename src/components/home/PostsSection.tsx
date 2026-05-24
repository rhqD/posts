"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PostCard from "@/components/post/PostCard";
import type { Post } from "@/lib/supabase/types";

export default function PostsSection({ posts }: { posts: Post[] }) {
  return (
    <section id="posts" className="px-6 sm:px-12 lg:px-20 py-24 lg:py-32 dark" style={{ background: "#0d0d0d" }}>
      <div className="max-w-7xl mx-auto">
        <motion.div
          className="mb-16 lg:mb-24"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-stone-500 mb-4 block">
            Writing
          </span>
          <div className="flex items-end justify-between">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-white" style={{ fontFamily: "var(--font-serif)" }}>
              Recent posts
            </h2>
            <Link
              href="/posts"
              className="hidden sm:inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white transition-colors"
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
        </motion.div>

        {posts.length === 0 ? (
          <p className="text-stone-500 text-sm italic">No posts yet.</p>
        ) : (
          <div className="space-y-10">
            {posts.map((post, i) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
              >
                {i === 0 ? (
                  <PostCard post={post} featured />
                ) : (
                  <PostCard post={post} />
                )}
              </motion.div>
            ))}
          </div>
        )}

        <div className="mt-12 sm:hidden">
          <Link href="/posts" className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white transition-colors">
            View all posts <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
