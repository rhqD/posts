"use client";

import { motion } from "framer-motion";
import { MapPin, Building2, GraduationCap, Sprout, Leaf } from "lucide-react";
import type { Profile } from "@/lib/supabase/types";

const highlights = [
  { icon: MapPin, label: "Xi'an → Beijing → Hangzhou", color: "#f472b6" },
  { icon: GraduationCap, label: "B.Eng. Software Engineering", color: "#818cf8" },
  { icon: Building2, label: "Frontend Architecture & Complexity Management", color: "#60a5fa" },
  { icon: Sprout, label: "ML fundamentals — built neural nets from scratch", color: "#34d399" },
];

// Decorative leaf SVG
function LeafDecor({ className, delay }: { className?: string; delay?: number }) {
  return (
    <motion.div
      className={`absolute pointer-events-none ${className}`}
      initial={{ opacity: 0, rotate: -30, scale: 0 }}
      animate={{ opacity: 0.15, rotate: 0, scale: 1 }}
      transition={{ delay: delay || 0, duration: 1.2, ease: "easeOut" }}
    >
      <Leaf size={24} style={{ color: "#4ade80" }} />
    </motion.div>
  );
}

export default function AboutSection({ profile }: { profile: Profile | null }) {
  const name = profile?.full_name || "Ren Hanquan";
  const bio = profile?.bio || "Senior frontend engineer specializing in large-scale application architecture and full-lifecycle performance optimization. From Xi'an, Shaanxi. Career spans DingTalk collaborative tools, Web3, and low-code platforms. Avid gardener.";
  const location = profile?.location;
  const email = profile?.email;
  const initials = name.split(" ").map(n => n[0]).join("");

  return (
    <section id="about" className="px-6 py-16 relative overflow-hidden z-10"
      style={{ background: "#1a1d24", borderTop: "2px solid rgba(74,222,128,0.3)" }}>
      {/* Decorative leaves */}
      <LeafDecor className="top-20 left-[10%]" delay={0.5} />
      <LeafDecor className="top-40 right-[8%]" delay={0.8} />
      <LeafDecor className="bottom-32 left-[5%]" delay={1.1} />

      {/* Section divider top */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(74,222,128,0.15), transparent)" }} />

      <div className="max-w-5xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.3em] mb-4 block" style={{ color: "rgba(74,222,128,0.4)" }}>About</span>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight" style={{ color: "#fff", fontFamily: "var(--font-serif)" }}>
            A developer who<br />
            <span style={{ background: "linear-gradient(90deg, #4ade80, #22d3ee, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              grows things.
            </span>
          </h2>
          <p className="text-sm mt-3 italic" style={{ color: "rgba(255,255,255,0.2)" }}>
            — code, plants, and everything in between
          </p>
        </motion.div>

        <div className="grid md:grid-cols-5 gap-10 items-start">
          {/* Avatar */}
          <motion.div
            className="md:col-span-2 flex justify-center md:justify-end"
            initial={{ opacity: 0, scale: 0.8, x: -30 }}
            whileInView={{ opacity: 1, scale: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <motion.div className="relative" whileHover={{ scale: 1.03 }} transition={{ duration: 0.4 }}>
              {/* Decorative ring */}
              <div className="absolute -inset-3 rounded-[2rem] opacity-30"
                style={{ background: "conic-gradient(from 0deg, #4ade80, #22d3ee, #818cf8, #4ade80)" }} />
              <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-3xl overflow-hidden ring-1 ring-white/10">
                <div className="w-full h-full bg-gradient-to-br from-emerald-800 via-teal-700 to-indigo-900 flex items-center justify-center">
                  <span className="text-7xl font-bold text-white/70 font-serif">
                    {initials}
                  </span>
                </div>
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 60%)" }} />
              </div>
            </motion.div>
          </motion.div>

          {/* Bio + highlights */}
          <motion.div
            className="md:col-span-3 space-y-6"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          >
            <p className="text-base sm:text-lg leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
              {bio}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
              {highlights.map((item, i) => (
                <motion.div
                  key={item.label}
                  className="flex items-start gap-3 p-3.5 rounded-xl border transition-colors duration-300"
                  style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)" }}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 + i * 0.1, duration: 0.4 }}
                  whileHover={{ borderColor: `${item.color}22` }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${item.color}15` }}>
                    <item.icon size={14} style={{ color: item.color }} />
                  </div>
                  <span className="text-sm leading-snug" style={{ color: "rgba(255,255,255,0.5)" }}>{item.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
