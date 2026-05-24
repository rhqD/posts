"use client";

import { motion } from "framer-motion";
import type { Experience } from "@/lib/supabase/types";

function formatDateStr(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const brandColors: Record<string, string> = {
  "ByteDance": "#6366f1",
  "Parallel Finance": "#22d3ee",
  "Alibaba": "#f97316",
  "ThoughtWorks": "#e11d48",
  "Grape City": "#10b981",
};

export default function TimelineSection({ experiences }: { experiences: Experience[] }) {
  if (experiences.length === 0) return null;

  return (
    <section id="timeline" className="px-6 sm:px-12 lg:px-20 py-24 lg:py-32" style={{ background: "#fff" }}>
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-16">
          <motion.div
            className="lg:col-span-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="lg:sticky lg:top-24">
              <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-stone-400 mb-4 block">
                Experience
              </span>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight mb-4" style={{ fontFamily: "var(--font-serif)" }}>
                Career<br />Journey
              </h2>
              <p className="text-sm text-stone-400 italic">5 companies, 3 cities, 10+ years</p>
            </div>
          </motion.div>

          <div className="lg:col-span-8 space-y-12">
            {experiences.map((exp, index) => {
              const duration = exp.end_date
                ? `${formatDateStr(exp.start_date)} — ${formatDateStr(exp.end_date)}`
                : `${formatDateStr(exp.start_date)} — Now`;
              const brand = Object.entries(brandColors).find(([k]) => exp.company.includes(k))?.[1] || "#6366f1";

              return (
                <motion.div
                  key={exp.id}
                  className="group border-t border-stone-100 pt-8 first:border-t-0 first:pt-0"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[10px] font-mono tracking-wider text-stone-400">{duration}</span>
                    {exp.location && (
                      <span className="text-[10px] text-stone-300">{exp.location}</span>
                    )}
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-1 tracking-tight" style={{ color: brand }}>
                    {exp.role}
                  </h3>
                  <p className="text-sm font-medium text-stone-600 mb-3">
                    {exp.company}
                    {exp.company_url && (
                      <a href={exp.company_url} target="_blank" rel="noreferrer" className="ml-2 text-stone-300 text-xs">↗</a>
                    )}
                  </p>
                  <p className="text-sm text-stone-500 leading-relaxed max-w-lg">
                    {exp.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
