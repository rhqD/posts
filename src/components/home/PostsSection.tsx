"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, PenLine } from "lucide-react";
import PostCard from "@/components/post/PostCard";
import { staggerContainer, fadeInUp } from "@/lib/animations";
import type { Post } from "@/lib/supabase/types";

export default function PostsSection({ posts }: { posts: Post[] }) {
  return (
    <section id="posts" className="px-6 py-12 sm:py-16 relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0d1117 0%, #0c0f14 50%, #0d1117 100%)" }}>
      <div className="max-w-3xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-8 sm:mb-12"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.3em] mb-4 block" style={{ color: "rgba(251,191,36,0.4)" }}>
            <PenLine size={12} className="inline mr-2" />
            Writing
          </span>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-3 leading-tight" style={{ color: "#fff", fontFamily: "var(--font-serif)" }}>
            Recent<br />
            <span style={{ background: "linear-gradient(90deg, #fbbf24, #f59e0b, #d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              harvest
            </span>
          </h2>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>Thoughts & tutorials from the field</p>
        </motion.div>

        {posts.length === 0 ? (
          <p className="text-center py-16 text-sm" style={{ color: "rgba(255,255,255,0.2)" }}>
            Seeds planted. Waiting to bloom.
          </p>
        ) : (
          <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            {posts.map((post, i) => (
              <motion.div key={post.id} variants={fadeInUp}>
                <PostCard post={post} featured={i === 0} />
              </motion.div>
            ))}
          </motion.div>
        )}

        <motion.div
          className="text-center mt-12"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <Link
            href="/posts"
            className="inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-full border transition-all duration-300 hover:gap-3 hover:border-yellow-500/20"
            style={{ color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.08)" }}
          >
            Browse all posts
            <ArrowRight size={16} />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
