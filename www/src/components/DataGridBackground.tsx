import { useEffect, useRef } from "react";

export default function DataGridBackground() {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const rows = 20;
    const cols = 30;
    const centerR = rows / 2;
    const centerC = cols / 2;

    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.innerHTML = "";

    for (let i = 0; i < rows * cols; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const dist = Math.sqrt((r - centerR) ** 2 + (c - centerC) ** 2);
      const delay = dist * 0.15;

      const cell = document.createElement("div");
      cell.style.cssText = `
        background: #DC2626;
        border-radius: 2px;
        opacity: 0.03;
        animation: grid-pulse 4s infinite alternate;
        animation-delay: ${delay.toFixed(2)}s;
      `;
      grid.appendChild(cell);
    }

    // Mouse glow
    const onMove = (e: MouseEvent) => {
      const rect = grid.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      grid.style.setProperty("--mx", `${mx}px`);
      grid.style.setProperty("--my", `${my}px`);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div
      ref={gridRef}
      className="absolute inset-0 pointer-events-none grid gap-[3px] p-4 z-0"
      style={{ pointerEvents: "all" }}
    />
  );
}
