"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { Skill } from "@/lib/supabase/types";

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
    <section id="skills" className="px-6 sm:px-12 lg:px-20 py-24 lg:py-32" style={{ background: "#faf8f5" }}>
      <div className="max-w-7xl mx-auto">
        <motion.div
          className="mb-16 lg:mb-24"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-stone-400 mb-4 block">
            Skills & Expertise
          </span>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>
            What I cultivate
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16">
          {grouped.map(([category, categorySkills], gi) => (
            <motion.div
              key={category}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: gi * 0.1, duration: 0.5 }}
            >
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.3em] text-stone-300 mb-6 pb-4 border-b border-stone-100">
                {category}
              </h3>
              <div className="space-y-4">
                {categorySkills.map((skill) => (
                  <div key={skill.id} className="group">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm text-stone-700 group-hover:text-stone-900 transition-colors">
                        {skill.name}
                      </span>
                      <span className="text-[10px] text-stone-300 tabular-nums">{skill.proficiency}%</span>
                    </div>
                    <div className="h-px bg-stone-100 overflow-hidden">
                      <motion.div
                        className="h-full bg-stone-300 origin-left"
                        initial={{ scaleX: 0 }}
                        whileInView={{ scaleX: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: gi * 0.1 }}
                        style={{ width: `${skill.proficiency}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
