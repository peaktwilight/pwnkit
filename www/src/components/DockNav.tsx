import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";

const SECTIONS = [
  {
    id: "hero",
    label: "Home",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: "commands",
    label: "Commands",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
  {
    id: "pipeline",
    label: "Pipeline",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
  {
    id: "comparison",
    label: "Compare",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    id: "github",
    label: "GitHub",
    href: "https://github.com/peaktwilight/nightfang",
    icon: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
      </svg>
    ),
  },
];

export default function DockNav() {
  const [active, setActive] = useState(0);

  const scrollTo = useCallback((index: number) => {
    const section = document.querySelector<HTMLElement>(
      `[data-section="${SECTIONS[index].id}"]`
    );
    if (section) {
      section.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const viewportH = window.innerHeight;
      const threshold = scrollTop + viewportH / 2;

      let current = 0;
      // Only check sections that exist on page (skip github)
      for (let i = 0; i < SECTIONS.length; i++) {
        if (SECTIONS[i].href) continue;
        const el = document.querySelector<HTMLElement>(
          `[data-section="${SECTIONS[i].id}"]`
        );
        if (el && el.offsetTop <= threshold) {
          current = i;
        }
      }
      setActive(current);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 hidden md:block"
    >
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="flex items-center gap-0.5 rounded-2xl border border-white/10 bg-[#0a0a0a]/70 backdrop-blur-2xl px-1.5 py-1.5 shadow-2xl shadow-black/20"
      >
        {SECTIONS.map((section, i) => {
          const isActive = i === active;
          const isExternal = !!section.href;

          const inner = (
            <>
              <span
                className={`shrink-0 transition-colors duration-200 ${
                  isActive
                    ? "text-white"
                    : "text-white/25 group-hover:text-white/50"
                }`}
              >
                {section.icon}
              </span>

              <motion.div
                animate={{
                  width: isActive ? "auto" : 0,
                  opacity: isActive ? 1 : 0,
                }}
                initial={false}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-clip"
              >
                <span className="text-[11px] font-medium text-white whitespace-nowrap pl-1.5">
                  {section.label}
                </span>
              </motion.div>

              {isActive && (
                <motion.div
                  layoutId="dock-dot"
                  className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-[2px] w-4 rounded-full bg-white"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </>
          );

          if (isExternal) {
            return (
              <a
                key={section.id}
                href={section.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`group relative flex items-center h-9 rounded-xl px-2.5 ${
                  isActive
                    ? "bg-white/[0.08]"
                    : "hover:bg-white/[0.04]"
                }`}
              >
                {inner}
              </a>
            );
          }

          return (
            <motion.button
              key={section.id}
              onClick={() => scrollTo(i)}
              layout="position"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={`group relative flex items-center h-9 rounded-xl px-2.5 ${
                isActive
                  ? "bg-white/[0.08]"
                  : "hover:bg-white/[0.04]"
              }`}
            >
              {inner}
            </motion.button>
          );
        })}
      </motion.div>
    </motion.nav>
  );
}
