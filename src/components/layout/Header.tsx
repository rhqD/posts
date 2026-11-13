"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { House } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import BGMPlayer from "./BGMPlayer";
import LoginControl from "./LoginControl";

const navLinks = [
  { href: "/#about", label: "About" },
  { href: "/#skills", label: "Skills" },
  { href: "/#timeline", label: "Experience" },
  { href: "/posts", label: "Blog" },
];

export default function Header() {
  const pathname = usePathname();
  const isYard = pathname === "/home" || pathname === "/home/";
  const [yardSky, setYardSky] = useState("#86c7ee");
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

  useEffect(() => {
    const updateSky = () => setYardSky(document.documentElement.style.getPropertyValue("--yard-sky").trim() || "#86c7ee");
    updateSky();
    window.addEventListener("yard-sky-change", updateSky);
    return () => window.removeEventListener("yard-sky-change", updateSky);
  }, []);

  const overHero = pathname === "/" && !scrolled;
  const chromeColor = isYard ? yardSky : overHero ? "#0a0f0a" : isDark ? "#0a0a0f" : "#F9F7F4";
  useEffect(() => {
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => { meta.content = chromeColor; });
    document.documentElement.style.setProperty("--browser-chrome-color", chromeColor);
  }, [chromeColor, pathname]);

  const headerBg = isYard ? yardSky : scrolled
    ? isDark ? "rgba(10,10,15,0.8)" : "rgba(249,247,244,0.9)"
    : "transparent";
  const headerBorder = scrolled && !isYard
    ? isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)"
    : "1px solid transparent";
  const skyRgb = Number.parseInt(yardSky.slice(1), 16);
  const skyLuminance = (((skyRgb >> 16) & 255) * .2126 + ((skyRgb >> 8) & 255) * .7152 + (skyRgb & 255) * .0722) / 255;
  const headerDark = isYard ? skyLuminance < .45 : isDark || overHero;
  const textColor = headerDark ? "#fff" : "#1a2e1a";
  const textMuted = headerDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)";

  return (
    <header
      className={`site-header fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isYard ? "select-none" : ""}`}
      style={{
        background: headerBg,
        backdropFilter: scrolled ? "blur(20px) saturate(150%)" : "none",
        borderBottom: headerBorder,
        WebkitTouchCallout: isYard ? "none" : undefined,
      }}
    >
      <div className="site-header-inner mx-auto max-w-5xl px-6 h-12 sm:h-14 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/home"
            aria-label="Home — 3D courtyard"
            title="Home"
            className="p-1 -m-1 rounded-lg transition-opacity hover:opacity-60"
            style={{ color: textColor }}
          >
            <House size={16} />
          </Link>
          <Link
            href="/"
            className="font-semibold tracking-tight text-xs sm:text-sm transition-opacity hover:opacity-70"
            style={{ color: textColor }}
          >
            Ren Hanquan
          </Link>
        </div>
        <div className="flex items-center gap-1 min-w-0">
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
          <LoginControl color={textMuted} muted={textMuted} />
        </div>
      </div>
    </header>
  );
}