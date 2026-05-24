"use client";

import { motion } from "framer-motion";
import type { Profile } from "@/lib/supabase/types";

export default function HeroSection({ profile }: { profile: Profile | null }) {
  const name = profile?.full_name || "Ren Hanquan";
  const headline = profile?.headline || "Senior Frontend Engineer";

  return (
    <section id="hero" className="relative overflow-hidden" style={{ background: "#faf8f5" }}>
      {/* Full-bleed image — bottom half */}
      <div className="w-full h-[40vh] sm:h-[50vh] lg:h-[55vh] relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/garden-day-v5.jpg"
          alt=""
          className="w-full h-full object-cover"
        />
        {/* Gradient fade from top */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, #faf8f5 0%, transparent 30%, transparent 70%, rgba(250,248,245,0.3) 100%)" }} />
      </div>

      {/* Text content — overlapping the image */}
      <div className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-20 w-full -mt-[25vh] sm:-mt-[30vh] relative z-10 pb-16">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="max-w-3xl"
          >
            <span className="text-xs font-medium uppercase tracking-[0.3em] text-stone-500 mb-4 sm:mb-6 block">
              Personal Site &amp; Blog
            </span>
            <h1
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold leading-[0.95] tracking-tighter"
              style={{
                color: "#fff",
                fontFamily: "var(--font-serif)",
                mixBlendMode: "difference",
                filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))",
              }}
            >
              {name.split(" ").map((part, i) => (
                <span key={i}>
                  {part}
                  {i === 0 && <br />}
                </span>
              ))}
            </h1>
          </motion.div>

          <motion.div
            className="mt-8 sm:mt-12 flex flex-wrap items-center gap-3 sm:gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            <p className="text-sm sm:text-base text-white/90 max-w-md" style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", mixBlendMode: "difference", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.5))" }}>
              {headline}
            </p>
            <span className="text-stone-300 hidden sm:inline">·</span>
            <span className="text-[11px] uppercase tracking-wider text-white/50">Xi&apos;an → Beijing → Hangzhou</span>
          </motion.div>

          <motion.div
            className="mt-10 sm:mt-14 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.6 }}
          >
            {["Frontend Perf", "Low-Code", "Architecture", "Gardening"].map((tag) => (
              <span key={tag} className="text-[11px] uppercase tracking-wider px-3 py-1.5 border border-white/30 text-white/80 rounded backdrop-blur-sm" style={{ background: "rgba(0,0,0,0.15)" }}>
                {tag}
              </span>
            ))}
            <span className="text-[11px] text-white/30 ml-2">Vol. 1, 2026</span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
