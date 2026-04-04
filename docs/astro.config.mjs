import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  output: "static",
  outDir: "./dist",
  site: "https://docs.pwnkit.com",
  integrations: [
    starlight({
      title: "pwnkit",
      description:
        "Documentation for pwnkit — fully autonomous agentic pentesting framework.",
      logo: {
        src: "./src/assets/pwnkit-icon.gif",
        alt: "pwnkit",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/peaktwilight/pwnkit",
        },
        {
          icon: "external",
          label: "Website",
          href: "https://pwnkit.com",
        },
      ],
      defaultLocale: "root",
      expressiveCode: {
        themes: ["dracula"],
      },
      sidebar: [
        {
          label: "Getting Started",
          slug: "getting-started",
        },
        {
          label: "Commands",
          slug: "commands",
        },
        {
          label: "Configuration",
          slug: "configuration",
        },
        {
          label: "Architecture",
          slug: "architecture",
        },
        {
          label: "Core Concepts",
          items: [
            { label: "Agent Loop", slug: "agent-loop" },
            { label: "Blind Verification", slug: "blind-verification" },
            { label: "White-Box Mode", slug: "white-box-mode" },
            { label: "Budget Management", slug: "budget-management" },
          ],
        },
        {
          label: "Benchmark",
          slug: "benchmark",
        },
        {
          label: "Research",
          items: [
            { label: "Overview", slug: "research" },
            { label: "Shell-First Rationale", slug: "research/shell-first" },
            { label: "Model Comparison", slug: "research/model-comparison" },
            { label: "XBOW Analysis", slug: "research/xbow-analysis" },
            { label: "Competitive Landscape", slug: "research/competitive-landscape" },
          ],
        },
        {
          label: "API Keys",
          slug: "api-keys",
        },
      ],
      customCss: ["./src/styles/custom.css"],
    }),
  ],
});
