"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import { useTypewriter } from "@/hooks/useTypewriter";
import type { Profile } from "@/lib/supabase/types";

// --- Floating canvas for leaves + fireflies ---
function GardenCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pre-generate particles
  const particles = useMemo(() => {
    const items: {
      type: "leaf" | "firefly";
      x: number; y: number; size: number;
      speedX: number; speedY: number; wobble: number;
      phase: number; rotation: number; rotSpeed: number;
      color: string; alpha: number;
    }[] = [];

    // Leaves — fall from top
    for (let i = 0; i < 25; i++) {
      items.push({
        type: "leaf",
        x: Math.random(),
        y: Math.random() * -1,
        size: 6 + Math.random() * 10,
        speedX: (Math.random() - 0.5) * 0.15,
        speedY: 0.2 + Math.random() * 0.4,
        wobble: 0.3 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.02,
        color: `hsl(${80 + Math.random() * 40}, ${60 + Math.random() * 30}%, ${30 + Math.random() * 25}%)`,
        alpha: 0.3 + Math.random() * 0.4,
      });
    }

    // Fireflies — scattered around
    for (let i = 0; i < 35; i++) {
      items.push({
        type: "firefly",
        x: Math.random(),
        y: 0.2 + Math.random() * 0.6,
        size: 1.5 + Math.random() * 2.5,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.25,
        wobble: Math.random() * Math.PI * 2,
        phase: Math.random() * Math.PI * 2,
        rotation: 0, rotSpeed: 0,
        color: `hsl(${50 + Math.random() * 30}, 90%, 70%)`,
        alpha: 0,
      });
    }

    return items;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let w = 0;
    let h = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas!.parentElement!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    function drawLeaf(x: number, y: number, size: number, rotation: number, color: string, alpha: number) {
      ctx!.save();
      ctx!.translate(x, y);
      ctx!.rotate(rotation);
      ctx!.globalAlpha = alpha;
      ctx!.fillStyle = color;
      ctx!.beginPath();
      ctx!.ellipse(0, 0, size, size * 0.45, 0, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.strokeStyle = color;
      ctx!.lineWidth = 0.5;
      ctx!.globalAlpha = alpha * 0.5;
      ctx!.beginPath();
      ctx!.moveTo(-size * 0.7, 0);
      ctx!.lineTo(size * 0.7, 0);
      ctx!.stroke();
      ctx!.restore();
    }

    function drawFirefly(x: number, y: number, size: number, alpha: number) {
      const glow = ctx!.createRadialGradient(x, y, 0, x, y, size * 4);
      glow.addColorStop(0, `rgba(165, 243, 252, ${alpha})`);
      glow.addColorStop(0.3, `rgba(165, 243, 252, ${alpha * 0.4})`);
      glow.addColorStop(1, "transparent");
      ctx!.fillStyle = glow;
      ctx!.beginPath();
      ctx!.arc(x, y, size * 4, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.fillStyle = `rgba(255, 255, 200, ${alpha})`;
      ctx!.beginPath();
      ctx!.arc(x, y, size * 0.6, 0, Math.PI * 2);
      ctx!.fill();
    }

    const startTime = performance.now();
    function frame(now: number) {
      ctx!.clearRect(0, 0, w, h);
      const elapsed = (now - startTime) / 1000;

      particles.forEach((p) => {
        if (p.type === "leaf") {
          p.y += p.speedY * 0.005;
          p.x += Math.sin(elapsed * p.wobble + p.phase) * 0.002;
          p.rotation += p.rotSpeed;
          if (p.y > 1.1) { p.y = -0.1; p.x = Math.random(); }
          drawLeaf(p.x * w, p.y * h, p.size, p.rotation, p.color, p.alpha);
        } else {
          p.x += Math.sin(elapsed * p.speedX + p.phase) * 0.003;
          p.y += Math.cos(elapsed * p.speedY + p.wobble) * 0.002;
          if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0;
          if (p.y < 0) p.y = 1; if (p.y > 1) p.y = 0;
          const pulse = 0.4 + 0.6 * Math.sin(elapsed * 2.5 + p.phase);
          drawFirefly(p.x * w, p.y * h, p.size, pulse * 0.7);
        }
      });

      animId = requestAnimationFrame(frame);
    }

    animId = requestAnimationFrame(frame);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, [particles]);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-[2]" />;
}

function ScrollRibbon() {
  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 flex justify-center pb-8 z-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 2, duration: 1 }}
    >
      <button
        onClick={() => document.getElementById("about")?.scrollIntoView({ behavior: "smooth" })}
        className="flex flex-col items-center gap-3 cursor-pointer group"
      >
        <span className="text-[10px] uppercase tracking-[0.4em] font-medium transition-colors" style={{ color: "rgba(0,0,0,0.35)" }}>
          Explore
        </span>
        <motion.div
          className="w-6 h-10 rounded-full border flex items-start justify-center p-1.5"
          style={{ borderColor: "rgba(0,0,0,0.15)" }}
          animate={{ boxShadow: ["0 0 0px rgba(34,139,34,0)", "0 0 12px rgba(34,139,34,0.15)", "0 0 0px rgba(34,139,34,0)"] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <motion.div
            className="w-1 h-2.5 rounded-full bg-green-700/50"
            animate={{ y: [0, 14, 0], opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      </button>
    </motion.div>
  );
}

export default function HeroSection({ profile }: { profile: Profile | null }) {
  const typewriterText = useTypewriter([
    "Frontend Performance",
    "Low-Code Platforms",
    "Collaborative Editing",
    "Gardening · Plants",
  ]);

  const name = profile?.full_name || "Ren Hanquan";
  const headline = profile?.headline;

  return (
    <section
      id="hero"
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: "#0a0f0a" }}
    >
      {/* Garden illustration — day (light mode) */}
      <div className="absolute inset-0 z-0 block dark:hidden">
        <Image
          src="/garden-day.jpg"
          alt="Garden office"
          fill
          className="object-cover"
          priority
        />
      </div>
      {/* Garden illustration — night (dark mode) */}
      <div className="absolute inset-0 z-0 hidden dark:block">
        <Image
          src="/garden-night.jpg"
          alt="Garden office at night"
          fill
          className="object-cover"
          priority
        />
      </div>

      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background: "linear-gradient(0deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.0) 70%, rgba(0,0,0,0.15) 100%)",
        }}
      />

      {/* Floating leaves + fireflies canvas */}
      <GardenCanvas />

      {/* Content */}
      <motion.div
        className="relative z-10 text-center max-w-4xl px-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.4 }}
      >
        {/* Location pill */}
        <motion.div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-10 border backdrop-blur-sm"
          style={{ borderColor: "rgba(0,0,0,0.1)", background: "rgba(255,255,255,0.4)" }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          <span className="text-[11px] tracking-wide font-medium" style={{ color: "rgba(0,0,0,0.55)" }}>
            Xi&apos;an, Shaanxi → Beijing
          </span>
        </motion.div>

        {/* Name */}
        <motion.h1
          className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-bold mb-8 tracking-tighter"
          style={{ fontFamily: "var(--font-serif)" }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <span style={{
            color: "#1a2e1a",
            textShadow: "0 0 20px rgba(255,255,255,0.9), 0 0 40px rgba(255,255,255,0.6), 0 2px 4px rgba(0,0,0,0.15)",
          }}>
            {name}
          </span>
        </motion.h1>

        {/* Headline or typewriter */}
        <motion.div
          className="text-xl sm:text-2xl md:text-3xl font-light h-10 flex items-center justify-center gap-1 mb-10"
          style={{ color: "rgba(0,0,0,0.6)", textShadow: "0 0 12px rgba(255,255,255,0.8), 0 0 24px rgba(255,255,255,0.5)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.6 }}
        >
          {headline ? (
            <span>{headline}</span>
          ) : (
            <>
              <span className="text-emerald-700/80">{typewriterText}</span>
              <motion.span
                className="inline-block w-[2px] h-6 bg-emerald-700/70 ml-0.5"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.8, repeat: Infinity, repeatType: "reverse" }}
              />
            </>
          )}
        </motion.div>

        {/* Tags */}
        <motion.div
          className="flex flex-wrap justify-center gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.5 }}
        >
          {["Frontend Perf", "Low-Code", "Core Web Vitals", "Gardening"].map((tag, i) => (
            <motion.span
              key={tag}
              className="px-4 py-2 rounded-full text-xs border backdrop-blur-sm cursor-default"
              style={{
                borderColor: "rgba(0,0,0,0.12)",
                color: "rgba(0,0,0,0.5)",
                background: "rgba(255,255,255,0.4)",
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.6 + i * 0.1, duration: 0.3 }}
              whileHover={{
                scale: 1.05,
                borderColor: "rgba(34,139,34,0.5)",
                color: "#228b22",
                background: "rgba(255,255,255,0.7)",
              }}
            >
              {tag}
            </motion.span>
          ))}
        </motion.div>
      </motion.div>

      <ScrollRibbon />
    </section>
  );
}
