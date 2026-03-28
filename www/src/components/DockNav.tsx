import { useState, useEffect } from "react";
import { motion } from "framer-motion";

const SECTIONS = [
  { id: "hero", label: "Home" },
  { id: "commands", label: "Features" },
  { id: "comparison", label: "Compare" },
  { id: "ci", label: "CI" },
  { id: "about", label: "About" },
];

export default function DockNav() {
  const [active, setActive] = useState(-1);
  const [isHomepage, setIsHomepage] = useState(false);
  const [isBlogPage, setIsBlogPage] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    const onHome = path === "/" || path === "";
    setIsHomepage(onHome);
    setIsBlogPage(path.startsWith("/blog"));

    if (!onHome) {
      setActive(-1); // No section active on non-homepage
      return;
    }

    const onScroll = () => {
      const ids = [...SECTIONS.map(s => s.id)].reverse();
      for (const id of ids) {
        const el = document.querySelector(`[data-section="${id}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 120) {
            setActive(SECTIONS.findIndex(s => s.id === id));
            return;
          }
        }
      }
      setActive(0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = (id: string) => {
    if (isHomepage) {
      const el = document.querySelector(`[data-section="${id}"]`);
      el?.scrollIntoView({ behavior: "smooth" });
    } else {
      // Navigate to homepage with anchor
      window.location.href = id === "hero" ? "/" : `/#${id}`;
    }
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-24px)]"
    >
      <div
        className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-2xl px-1.5 py-1.5 shadow-2xl shadow-black/30 overflow-x-auto"
        style={{ fontFamily: "'Outfit', sans-serif" }}
      >
        <a href="/" className="flex items-center gap-1.5 h-9 rounded-lg px-2.5 mr-0.5 hover:bg-white/[0.04] transition-colors">
          <img src="/pwnkit-icon.gif" alt="" className="w-[28px] h-[28px] shrink-0 rounded-sm" />
          <span className="text-[13px] font-bold text-white tracking-tight leading-none" style={{ fontFamily: "'Outfit', sans-serif" }}>pwnkit</span>
        </a>

        <div className="h-5 w-px bg-white/10 hidden sm:block" />

        {SECTIONS.map((section, i) => {
          const isActive = i === active;
          return (
            <motion.button
              key={section.id}
              onClick={() => handleClick(section.id)}
              layout="position"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={`group relative hidden sm:flex items-center h-9 rounded-lg px-2.5 transition-colors ${
                isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
              }`}
            >
              <motion.span
                animate={{ opacity: isActive ? 1 : 0.35 }}
                className="text-[11px] font-medium text-white whitespace-nowrap"
              >
                {section.label}
              </motion.span>
              {isActive && (
                <motion.div
                  layoutId="nav-dot"
                  className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-[2px] w-4 rounded-full bg-white"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}

        <div className="h-5 w-px bg-white/10 ml-0.5" />

        <a href="/blog" className={`flex items-center h-9 rounded-lg px-2.5 text-[11px] font-medium transition-colors ${
          isBlogPage ? "text-white/70 bg-white/[0.08]" : "text-white/35 hover:text-white/70"
        }`}>Blog</a>

        <a href="https://github.com/peaktwilight/pwnkit" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 h-9 rounded-lg px-3 bg-white hover:bg-white/90 transition-colors ml-0.5">
          <svg className="w-3.5 h-3.5 text-black" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          <span className="text-[11px] font-bold text-black">GitHub</span>
        </a>
      </div>
    </motion.header>
  );
}
