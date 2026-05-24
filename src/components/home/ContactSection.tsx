"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Github, Mail, Copy, Check } from "lucide-react";
import type { Profile } from "@/lib/supabase/types";

export default function ContactSection({ profile }: { profile: Profile | null }) {
  const [copied, setCopied] = useState(false);

  const github = profile?.social_links?.github;
  const email = profile?.email;

  const handleCopy = async () => {
    if (email) {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section id="contact" className="px-6 sm:px-12 lg:px-20 py-24 lg:py-32" style={{ background: "#faf8f5" }}>
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-16">
          <motion.div
            className="lg:col-span-5"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-stone-400 mb-4 block">
              Contact
            </span>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight" style={{ fontFamily: "var(--font-serif)" }}>
              Get in<br />touch
            </h2>
          </motion.div>

          <motion.div
            className="lg:col-span-7 lg:pt-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="space-y-6">
              {email && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-3 group w-full text-left"
                >
                  <span className="w-10 h-10 rounded-full border border-stone-200 flex items-center justify-center group-hover:border-stone-400 transition-colors">
                    {copied ? <Check size={16} className="text-green-600" /> : <Copy size={14} className="text-stone-400" />}
                  </span>
                  <div>
                    <div className="text-sm text-stone-400">{copied ? "Copied!" : "Email"}</div>
                    <div className="text-sm font-medium text-stone-700">{email}</div>
                  </div>
                </button>
              )}

              {github && (
                <a
                  href={github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 group"
                >
                  <span className="w-10 h-10 rounded-full border border-stone-200 flex items-center justify-center group-hover:border-stone-400 transition-colors">
                    <Github size={16} className="text-stone-400" />
                  </span>
                  <div>
                    <div className="text-sm text-stone-400">GitHub</div>
                    <div className="text-sm font-medium text-stone-700">{github.replace("https://github.com/", "")}</div>
                  </div>
                </a>
              )}
            </div>

            {profile?.resume_url && (
              <a
                href={profile.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-10 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
              >
                Download Resume →
              </a>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
