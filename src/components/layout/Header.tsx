"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import BGMPlayer from "./BGMPlayer";

const navLinks = [
  { href: "/#about", label: "About" },
  { href: "/#skills", label: "Skills" },
  { href: "/#timeline", label: "Experience" },
  { href: "/posts", label: "Blog" },
  { href: "/garden", label: "Gardening" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const checkDark = () => setIsDark(document.documentElement.classList.contains("dark"));
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  const headerBg = scrolled
    ? isDark ? "rgba(10,10,15,0.8)" : "rgba(255,255,255,0.7)"
    : "transparent";
  const headerBorder = scrolled
    ? isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)"
    : "1px solid transparent";
  const textMuted = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)";

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: headerBg,
        backdropFilter: scrolled ? "blur(20px) saturate(150%)" : "none",
        borderBottom: headerBorder,
      }}
    >
      <div className="mx-auto max-w-5xl px-6 h-12 sm:h-14 flex items-center justify-between">
        <Link
          href="/"
          className="font-semibold tracking-tight text-xs sm:text-sm transition-opacity hover:opacity-70"
          style={{ color: isDark ? "#fff" : "#1a2e1a" }}
        >
          Ren Hanquan
        </Link>
        <nav className="flex items-center gap-0.5 text-sm overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap"
              style={{ color: textMuted }}
            >
              {link.label}
            </Link>
          ))}
          <BGMPlayer />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
