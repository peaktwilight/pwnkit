import { useEffect, useRef } from "react";

// Security-themed glyphs — hex codes, binary, symbols
const GLYPHS = [
  "0x", "ff", "00", ">>", "<<", "{}", "[]", "//",
  "CVE", "NF", "◆", "▸", "⚡", "█", "░",
  "01", "10", "11", "0f", "7f", "fe", "db",
  ">>", "=>", "->", "::", "&&", "||", "!=",
  "GET", "PUT", "POST", "RUN", "SCAN",
];

interface Particle {
  x: number;
  y: number;
  char: string;
  opacity: number;
  targetOpacity: number;
  size: number;
  speed: number;
  drift: number;
  phase: number;
}

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let particles: Particle[] = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };

    const createParticle = (): Particle => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      char: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
      opacity: 0,
      targetOpacity: Math.random() * 0.12 + 0.04,
      size: Math.random() * 12 + 9,
      speed: Math.random() * 0.12 + 0.04,
      drift: (Math.random() - 0.5) * 0.25,
      phase: Math.random() * Math.PI * 2,
    });

    const init = () => {
      resize();
      const count = Math.floor(
        (window.innerWidth * window.innerHeight) / 30000
      );
      particles = Array.from({ length: Math.min(count, 60) }, createParticle);
    };

    let time = 0;
    const animate = () => {
      time += 0.004;
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.y -= p.speed;
        p.x += Math.sin(time + p.phase) * p.drift;

        const breathe = Math.sin(time * 0.4 + p.phase) * 0.5 + 0.5;
        p.opacity += (p.targetOpacity * breathe - p.opacity) * 0.015;

        if (p.y < -20) {
          p.y = h + 20;
          p.x = Math.random() * w;
          p.char = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          p.phase = Math.random() * Math.PI * 2;
        }
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;

        // Draw with crimson tint for some particles
        const isCrimson = p.char === "CVE" || p.char === "NF" || p.char === "◆" || p.char === "⚡";
        ctx.font = `${p.size}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = isCrimson
          ? `rgba(220, 38, 38, ${p.opacity * 1.5})`
          : `rgba(255, 255, 255, ${p.opacity})`;
        ctx.fillText(p.char, p.x, p.y);
      }

      animationId = requestAnimationFrame(animate);
    };

    init();
    animate();

    window.addEventListener("resize", init);
    return () => {
      window.removeEventListener("resize", init);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-0"
      aria-hidden="true"
    />
  );
}
