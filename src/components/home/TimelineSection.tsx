"use client";

import { motion } from "framer-motion";
import { Calendar, MapPin, Sprout } from "lucide-react";
import type { Experience } from "@/lib/supabase/types";

function formatDateStr(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const brandMeta: Record<string, { color: string; glow: string; gradient: string }> = {
  "ByteDance": { color: "#818cf8", glow: "rgba(129,140,248,0.3)", gradient: "from-indigo-500 to-purple-500" },
  "Parallel Finance": { color: "#22d3ee", glow: "rgba(34,211,238,0.3)", gradient: "from-cyan-400 to-teal-400" },
  "Alibaba": { color: "#f97316", glow: "rgba(249,115,22,0.3)", gradient: "from-orange-400 to-amber-400" },
  "ThoughtWorks": { color: "#e11d48", glow: "rgba(225,29,72,0.3)", gradient: "from-rose-400 to-pink-400" },
  "Grape City": { color: "#10b981", glow: "rgba(16,185,129,0.3)", gradient: "from-emerald-400 to-green-400" },
};

function getBrandMeta(company: string) {
  for (const [key, meta] of Object.entries(brandMeta)) {
    if (company.includes(key)) return meta;
  }
  return { color: "#6366f1", glow: "rgba(99,102,241,0.3)", gradient: "from-indigo-400 to-violet-400" };
}

function TimelineCard({ exp, index }: { exp: Experience; index: number }) {
  const meta = getBrandMeta(exp.company);
  const duration = exp.end_date
    ? `${formatDateStr(exp.start_date)} — ${formatDateStr(exp.end_date)}`
    : `${formatDateStr(exp.start_date)} — Now`;

  return (
    <motion.div
      className="flex gap-6 mb-16 relative group"
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Timeline node */}
      <div className="flex flex-col items-center flex-shrink-0 pt-1">
        <motion.div
          className="w-4 h-4 rounded-full z-10 relative"
          style={{ background: meta.color, boxShadow: `0 0 16px ${meta.glow}` }}
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, duration: 0.4, ease: "backOut" }}
        />
        <div className="w-px flex-1 mt-3" style={{ background: `linear-gradient(180deg, ${meta.color}44, transparent)` }} />
      </div>

      {/* Content */}
      <div className="flex-1 pb-2">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <span className="text-[11px] font-mono tracking-wider px-2.5 py-1 rounded-full border"
            style={{ borderColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)" }}>
            <Calendar size={10} className="inline mr-1.5 opacity-50" />
            {duration}
          </span>
        </div>

        <h3 className="text-lg sm:text-xl font-bold mb-1 tracking-tight" style={{ color: "#fff" }}>
          {exp.role}
        </h3>

        <div className="flex flex-wrap items-center gap-2 mb-4" style={{ color: meta.color }}>
          <span className="text-sm font-semibold">{exp.company}</span>
          {exp.location && (
            <>
              <span className="opacity-30">·</span>
              <MapPin size={11} className="opacity-50" />
              <span className="text-xs opacity-50">{exp.location}</span>
            </>
          )}
        </div>

        <p className="text-sm leading-relaxed max-w-xl" style={{ color: "rgba(255,255,255,0.35)" }}>
          {exp.description}
        </p>

        {/* Hover highlight with brand color */}
        <div className="absolute -inset-4 -left-2 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{ background: `radial-gradient(600px circle at 40px 20px, ${meta.glow}, transparent 60%)` }} />
      </div>
    </motion.div>
  );
}

export default function TimelineSection({ experiences }: { experiences: Experience[] }) {
  if (experiences.length === 0) return null;

  return (
    <section id="timeline" className="px-6 py-12 sm:py-16 relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0d1117 0%, #0a0d10 50%, #0d1117 100%)" }}>
      {/* Ambient */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 20%, rgba(129,140,248,0.03), transparent 60%)" }} />

      <div className="max-w-3xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-10 sm:mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.3em] mb-4 block" style={{ color: "rgba(168,255,200,0.4)" }}>
            <Sprout size={12} className="inline mr-2" />
            Journey
          </span>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight" style={{ color: "#fff", fontFamily: "var(--font-serif)" }}>
            From seed<br />
            <span style={{ background: "linear-gradient(90deg, #10b981, #22d3ee, #f97316, #e11d48, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              to forest
            </span>
          </h2>
          <p className="text-sm mt-3" style={{ color: "rgba(255,255,255,0.2)" }}>
            Each experience a new branch
          </p>
        </motion.div>

        {experiences.map((exp, index) => (
          <TimelineCard key={exp.id} exp={exp} index={index} />
        ))}
      </div>
    </section>
  );
}
