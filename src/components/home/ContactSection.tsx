"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Github, Linkedin, Twitter, Globe, Mail, Download, Copy, Check, Flower2, MessageCircle } from "lucide-react";
import { staggerContainer, scaleIn } from "@/lib/animations";
import type { Profile } from "@/lib/supabase/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const socials: { key: string; label: string; icon: any; color: string; hoverGlow: string }[] = [
  { key: "github", label: "GitHub", icon: Github, color: "#f0f6fc", hoverGlow: "rgba(240,246,252,0.15)" },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin, color: "#0a66c2", hoverGlow: "rgba(10,102,194,0.15)" },
  { key: "twitter", label: "Twitter", icon: Twitter, color: "#1d9bf0", hoverGlow: "rgba(29,155,240,0.15)" },
];

export default function ContactSection({ profile }: { profile: Profile | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (profile?.email) {
      await navigator.clipboard.writeText(profile.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section id="contact" className="px-6 py-12 sm:py-16 relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0a0d10 0%, #0d1117 50%, #0a0a0f 100%)" }}>
      {/* Floating flower/plant silhouettes */}
      <motion.div className="absolute top-1/4 right-[5%] pointer-events-none opacity-[0.04]"
        animate={{ rotate: [0, 10, 0, -10, 0], y: [0, -15, 0, 15, 0] }}
        transition={{ duration: 20, repeat: Infinity }}>
        <Flower2 size={120} />
      </motion.div>
      <motion.div className="absolute bottom-1/4 left-[5%] pointer-events-none opacity-[0.03]"
        animate={{ rotate: [0, -8, 0, 8, 0], y: [0, 10, 0, -10, 0] }}
        transition={{ duration: 15, repeat: Infinity }}>
        <Flower2 size={100} />
      </motion.div>

      <div className="max-w-2xl mx-auto text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-8 sm:mb-12"
        >
          <span className="text-xs font-semibold uppercase tracking-[0.3em] mb-4 block" style={{ color: "rgba(168,255,200,0.4)" }}>
            <MessageCircle size={12} className="inline mr-2" />
            Contact
          </span>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4" style={{ color: "#fff", fontFamily: "var(--font-serif)" }}>
            Let&apos;s<br />
            <span style={{ background: "linear-gradient(90deg, #4ade80, #22d3ee, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              grow together
            </span>
          </h2>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
            {profile ? "Open to conversations about frontend, perf, gardening, or anything interesting." : "Find me online."}
          </p>
        </motion.div>

        {/* Social icons */}
        <motion.div
          className="flex flex-wrap justify-center gap-3 sm:gap-4 mb-12"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {socials.map(({ key, label, icon: Icon, color, hoverGlow }) => {
            const url = profile?.social_links?.[key as keyof NonNullable<Profile["social_links"]>];
            if (!url) return null;
            return (
              <motion.a
                key={key}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                variants={scaleIn}
                whileHover={{ scale: 1.12, y: -4 }}
                whileTap={{ scale: 0.95 }}
                className="w-14 h-14 rounded-2xl flex items-center justify-center border relative overflow-hidden transition-all group/icon"
                style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
                title={label}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${color}44`;
                  e.currentTarget.style.boxShadow = `0 0 30px ${hoverGlow}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <Icon size={20} style={{ color: "rgba(255,255,255,0.45)" }} />
              </motion.a>
            );
          })}
          {/* Email always shown if available */}
          {profile?.email && (
            <motion.button
              variants={scaleIn}
              onClick={handleCopy}
              whileHover={{ scale: 1.12, y: -4 }}
              whileTap={{ scale: 0.95 }}
              className="w-14 h-14 rounded-2xl flex items-center justify-center border relative overflow-hidden transition-all"
              style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
              title="Copy email"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(234,67,53,0.3)";
                e.currentTarget.style.boxShadow = "0 0 24px rgba(234,67,53,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              {copied ? <Check size={18} className="text-green-400" /> : <Mail size={18} style={{ color: "rgba(255,255,255,0.45)" }} />}
            </motion.button>
          )}
        </motion.div>

        {/* Email copy + Resume */}
        <motion.div
          className="flex flex-wrap justify-center gap-4"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          {profile?.email && (
            <motion.button
              onClick={handleCopy}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm transition-all border"
              style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
            >
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              {copied ? "Copied!" : profile.email}
            </motion.button>
          )}

          {profile?.resume_url && (
            <motion.a
              href={profile.resume_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium"
              style={{ background: "linear-gradient(135deg, #4ade80, #22d3ee)", color: "#0a0a0f" }}
              whileHover={{ scale: 1.03, boxShadow: "0 0 30px rgba(74,222,128,0.25)" }}
              whileTap={{ scale: 0.97 }}
            >
              <Download size={14} />
              Resume
            </motion.a>
          )}
        </motion.div>

        {/* Bottom quote */}
        <motion.p
          className="mt-16 text-sm italic"
          style={{ color: "rgba(255,255,255,0.12)" }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          &ldquo;The best time to plant a tree was 20 years ago. The second best time is now.&rdquo;
        </motion.p>
      </div>
    </section>
  );
}
