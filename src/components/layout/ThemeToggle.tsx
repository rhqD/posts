"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("theme");
    if (stored === "light") {
      setDark(false);
      document.documentElement.classList.remove("dark");
    }
    // Default is dark (set in layout.tsx), no action needed for "dark" or null
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  if (!mounted) return <div className="w-8 h-8" />;

  return (
    <button
      onClick={toggle}
      className="p-1.5 rounded-lg transition-all duration-300 hover:bg-black/5 dark:hover:bg-white/10"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? (
        <Sun size={16} className="text-white/50" />
      ) : (
        <Moon size={16} className="text-black/50" />
      )}
    </button>
  );
}
