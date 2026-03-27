import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const NAV_ITEMS = [
  { label: "Commands", href: "#commands" },
  { label: "Pipeline", href: "#pipeline" },
  { label: "Compare", href: "#comparison" },
];

const NIGHTFANG_ICON = (
  <svg className="w-4 h-4" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="6" fill="#0a0a0a" />
    <path
      d="M8 12 L16 6 L24 12 L24 22 L20 26 L16 22 L12 26 L8 22Z"
      fill="none"
      stroke="#DC2626"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <circle cx="13" cy="16" r="1.5" fill="#DC2626" />
    <circle cx="19" cy="16" r="1.5" fill="#DC2626" />
  </svg>
);

const GITHUB_ICON = (
  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

export default function FloatingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40);

      const sections = ["comparison", "pipeline", "commands"];
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 120) {
            setActiveSection(id);
            break;
          }
        }
      }
      if (window.scrollY < 100) setActiveSection("");
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      <div className="mx-auto max-w-6xl px-6">
        <AnimatePresence mode="wait">
          {scrolled ? (
            <motion.div
              key="scrolled"
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 flex h-12 items-center justify-between rounded-xl border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl px-1.5 pl-5 shadow-lg shadow-black/20"
            >
              <a href="#" className="flex items-center gap-2 group">
                {NIGHTFANG_ICON}
                <span className="text-[13px] font-semibold tracking-tight text-white">
                  nightfang
                </span>
              </a>

              <nav className="hidden md:flex items-center gap-1">
                {NAV_ITEMS.map((item) => {
                  const isActive = activeSection === item.href.slice(1);
                  return (
                    <a
                      key={item.label}
                      href={item.href}
                      className={`relative px-3 py-1.5 text-[12px] rounded-lg transition-colors ${
                        isActive
                          ? "text-white"
                          : "text-white/50 hover:text-white"
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="nav-pill"
                          className="absolute inset-0 rounded-lg bg-white/10"
                          transition={{
                            type: "spring",
                            bounce: 0.15,
                            duration: 0.5,
                          }}
                        />
                      )}
                      <span className="relative z-10">{item.label}</span>
                    </a>
                  );
                })}
              </nav>

              <a
                href="https://github.com/peaktwilight/nightfang"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-white text-black px-3 py-1.5 text-[11px] font-medium transition-opacity hover:opacity-80"
              >
                {GITHUB_ICON}
                Star
              </a>
            </motion.div>
          ) : (
            <motion.div
              key="top"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-16 items-center justify-between"
            >
              <a href="#" className="flex items-center gap-2.5 group">
                <div className="transition-transform group-hover:scale-105">
                  {NIGHTFANG_ICON}
                </div>
                <span className="text-[15px] font-semibold tracking-tight text-white">
                  nightfang
                </span>
              </a>

              <nav className="hidden items-center gap-8 md:flex">
                {NAV_ITEMS.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="text-[13px] text-white/50 transition-colors hover:text-white"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>

              <div className="flex items-center gap-4">
                <a
                  href="https://github.com/peaktwilight/nightfang"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[12px] text-white/50 transition-colors hover:text-white"
                >
                  {GITHUB_ICON}
                  GitHub
                </a>
                <a
                  href="https://www.npmjs.com/package/nightfang"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-white transition-colors hover:bg-white/10"
                >
                  npm
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
}
