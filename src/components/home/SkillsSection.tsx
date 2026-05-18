"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { fadeInUp, staggerContainer } from "@/lib/animations";
import type { Skill } from "@/lib/supabase/types";

const categoryIcons: Record<string, string> = {
  Frontend: "🌐",
  Platform: "🏗️",
  Backend: "⚙️",
  Language: "🔤",
  Domain: "🎯",
  "Soft Skills": "🤝",
};

function SkillBar({ name, proficiency, index }: { name: string; proficiency: number; index: number }) {
  const getGradient = (pct: number) => {
    if (pct >= 90) return "from-emerald-400 to-cyan-400";
    if (pct >= 80) return "from-teal-400 to-emerald-400";
    if (pct >= 70) return "from-cyan-400 to-blue-400";
    if (pct >= 60) return "from-blue-400 to-indigo-400";
    return "from-slate-500 to-slate-400";
  };

  const getShadow = (pct: number) => {
    if (pct >= 90) return "0 0 12px rgba(52,211,153,0.3)";
    if (pct >= 80) return "0 0 8px rgba(45,212,191,0.2)";
    return "none";
  };

  return (
    <motion.div
      className="mb-4 group"
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.04, duration: 0.4 }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium group-hover:text-white/90 transition-colors" style={{ color: "rgba(255,255,255,0.7)" }}>
          {name}
        </span>
        <span className="text-[11px] font-mono tabular-nums" style={{ color: "rgba(255,255,255,0.25)" }}>
          {proficiency}%
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${getGradient(proficiency)}`}
          initial={{ width: 0 }}
          whileInView={{ width: `${proficiency}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: index * 0.04 + 0.15, ease: [0.34, 1.3, 0.64, 1] }}
          style={{ boxShadow: getShadow(proficiency) }}
        />
      </div>
    </motion.div>
  );
}

export default function SkillsSection({ skills }: { skills: Skill[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, Skill[]>();
    skills.forEach((s) => {
      const list = map.get(s.category) || [];
      list.push(s);
      map.set(s.category, list);
    });
    return Array.from(map.entries());
  }, [skills]);

  if (skills.length === 0) return null;

  return (
    <section id="skills" className="px-6 py-16 relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0d1117 0%, #0a0c10 60%, #0d1117 100%)" }}>
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none rounded-full blur-[200px]"
        style={{ background: "radial-gradient(circle, rgba(74,222,128,0.04), transparent 70%)" }} />

      <div className="max-w-5xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.3em] mb-4 block" style={{ color: "rgba(74,222,128,0.4)" }}>Skills</span>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight" style={{ color: "#fff", fontFamily: "var(--font-serif)" }}>
            What I<br />
            <span style={{ background: "linear-gradient(90deg, #34d399, #22d3ee, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              cultivate
            </span>
          </h2>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-5"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {grouped.map(([category, categorySkills]) => (
            <motion.div
              key={category}
              variants={fadeInUp}
              className="p-6 rounded-2xl border backdrop-blur-sm group transition-all duration-500"
              style={{
                borderColor: "rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.01)",
              }}
              whileHover={{ borderColor: "rgba(74,222,128,0.15)", background: "rgba(74,222,128,0.02)" }}
            >
              <h3 className="font-semibold mb-5 text-xs uppercase tracking-[0.2em] flex items-center gap-2" style={{ color: "rgba(255,255,255,0.35)" }}>
                <span>{categoryIcons[category] || "📌"}</span>
                {category}
              </h3>
              <div>
                {categorySkills.map((skill, index) => (
                  <SkillBar
                    key={skill.id}
                    name={skill.name}
                    proficiency={skill.proficiency}
                    index={index}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
