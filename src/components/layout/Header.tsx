"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const navLinks = [
  { href: "/#about", label: "About" },
  { href: "/#skills", label: "Skills" },
  { href: "/#timeline", label: "Experience" },
  { href: "/posts", label: "Blog" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const headerBg = scrolled ? "rgba(255,255,255,0.85)" : "transparent";
  const headerBorder = scrolled ? "1px solid rgba(0,0,0,0.06)" : "1px solid transparent";

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: headerBg,
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: headerBorder,
      }}
    >
      <div className="mx-auto max-w-7xl px-6 sm:px-12 lg:px-20 h-12 sm:h-14 flex items-center justify-between">
        <Link
          href="/"
          className="font-semibold tracking-tight text-xs sm:text-sm transition-opacity hover:opacity-70 text-stone-800"
        >
          Ren Hanquan
        </Link>
        <nav className="flex items-center gap-0.5 text-sm overflow-x-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg transition-all duration-200 hover:bg-stone-100 whitespace-nowrap text-stone-500"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
