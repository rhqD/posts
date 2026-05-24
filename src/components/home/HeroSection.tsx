"use client";

import { motion } from "framer-motion";
import type { Profile } from "@/lib/supabase/types";

export default function HeroSection({ profile }: { profile: Profile | null }) {
  const name = profile?.full_name || "Ren Hanquan";
  const headline = profile?.headline || "Senior Frontend Engineer";

  return (
    <section
      id="hero"
      className="min-h-screen flex items-end pb-20 relative overflow-hidden"
      style={{ background: "#faf8f5" }}
    >
      {/* Decorative geometric shapes */}
      <div className="absolute top-0 right-0 w-1/2 h-full pointer-events-none opacity-[0.03]"
        style={{
          background: "repeating-linear-gradient(45deg, #000, #000 1px, transparent 1px, transparent 20px)",
        }}
      />
      <div className="absolute top-1/4 left-[5%] w-3 h-3 rounded-full bg-stone-300/50" />
      <div className="absolute top-1/3 right-[10%] w-2 h-2 rounded-full bg-stone-400/30" />

      <div className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-20 w-full">
        <motion.div
          className="grid lg:grid-cols-12 gap-8 lg:gap-16 items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          {/* Large name — spans most of grid */}
          <motion.div
            className="lg:col-span-8 xl:col-span-9"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            <span className="text-xs font-medium uppercase tracking-[0.3em] text-stone-400 mb-6 block">
              Personal Site &amp; Blog
            </span>
            <h1
              className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-bold leading-[0.9] tracking-tighter"
              style={{ color: "#1a1a1a", fontFamily: "var(--font-serif)" }}
            >
              {name.split(" ").map((part, i) => (
                <span key={i}>
                  {part}
                  {i === 0 && <br />}
                </span>
              ))}
            </h1>
          </motion.div>

          {/* Side meta — editorial pullout */}
          <motion.div
            className="lg:col-span-4 xl:col-span-3 border-t border-stone-200 pt-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            <p className="text-sm leading-relaxed text-stone-500 mb-6" style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>
              {headline}
            </p>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-stone-400">
              <span className="w-8 h-px bg-stone-300" />
              Xi&apos;an → Beijing → Hangzhou
            </div>
          </motion.div>
        </motion.div>

        {/* Bottom: tags + scroll */}
        <motion.div
          className="mt-16 lg:mt-24 flex flex-wrap items-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          {["Frontend Perf", "Low-Code", "Architecture", "Gardening"].map((tag) => (
            <span
              key={tag}
              className="text-[11px] uppercase tracking-wider px-3 py-1.5 border border-stone-200 text-stone-400"
            >
              {tag}
            </span>
          ))}
          <span className="text-[11px] text-stone-300 ml-2">
            Vol. 1, 2026
          </span>
        </motion.div>
      </div>
    </section>
  );
}
