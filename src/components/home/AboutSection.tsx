"use client";

import { motion } from "framer-motion";
import type { Profile } from "@/lib/supabase/types";

const stats = [
  { value: "10+", label: "Years Experience" },
  { value: "5", label: "Companies" },
  { value: "3", label: "Cities" },
];

export default function AboutSection({ profile }: { profile: Profile | null }) {
  const bio = profile?.bio || "Senior frontend engineer specializing in large-scale application architecture and full-lifecycle performance optimization.";
  const initials = (profile?.full_name || "Ren Hanquan").split(" ").map(n => n[0]).join("");

  return (
    <section id="about" className="px-6 sm:px-12 lg:px-20 py-24 lg:py-32" style={{ background: "#fff" }}>
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-16">
          {/* Left column: large initial + headshot */}
          <motion.div
            className="lg:col-span-5"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="sticky top-24">
              {/* Large monogram */}
              <div className="text-[20vw] lg:text-[12vw] font-bold leading-none tracking-tighter text-stone-100"
                style={{ fontFamily: "var(--font-serif)" }}>
                {initials}
              </div>
            </div>
          </motion.div>

          {/* Right column: bio + stats */}
          <motion.div
            className="lg:col-span-7 lg:pt-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-stone-400 mb-6 block">
              About
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-8 tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>
              A developer who<br />
              <span className="text-stone-300">grows things.</span>
            </h2>

            <p className="text-base sm:text-lg leading-relaxed text-stone-500 mb-12 max-w-xl">
              {bio}
            </p>

            {/* Stats — editorial pull */}
            <div className="grid grid-cols-3 gap-8 pt-8 border-t border-stone-100">
              {stats.map((s) => (
                <div key={s.label}>
                  <div className="text-3xl sm:text-4xl font-bold text-stone-900 mb-1" style={{ fontFamily: "var(--font-serif)" }}>
                    {s.value}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-stone-400">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Pull quote */}
            <blockquote className="mt-12 pl-6 border-l-2 border-stone-200">
              <p className="text-lg italic text-stone-400" style={{ fontFamily: "var(--font-serif)" }}>
                Code, plants, and everything in between.
              </p>
            </blockquote>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
