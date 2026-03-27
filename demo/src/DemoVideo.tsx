import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/JetBrainsMono";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

// ── Color palette (matches nightfang terminal.ts) ──
const C = {
  bg: "#0d1117",
  fg: "#e6edf3",
  dimmed: "#6e7681",
  red: "#ff7b72",
  redBg: "#da3633",
  orangeBg: "#d29922",
  yellowBg: "#e3b341",
  green: "#3fb950",
  blue: "#58a6ff",
  cyan: "#39d2c0",
  prompt: "#3fb950",
  cursor: "#58a6ff",
  border: "#30363d",
};

// ── Timeline (in seconds) ──
const T = {
  typeStart: 0.4,
  typeEnd: 2.8,
  bannerStart: 3.2,
  targetInfo: 4.0,
  discoveryStart: 5.0,
  discoveryDone: 5.8,
  attackStart: 6.2,
  attackEnd: 10.0,
  finding1: 10.6,
  finding2: 11.4,
  finding3: 12.2,
  finding4: 13.0,
  finding5: 13.8,
  summaryStart: 14.8,
  summaryEnd: 17.5,
};

const COMMAND = "npx nightfang scan --target https://demo.app/api/chat";

export const DemoVideo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.bg,
        fontFamily,
        fontSize: 16,
        color: C.fg,
        padding: 40,
        overflow: "hidden",
      }}
    >
      {/* Window chrome */}
      <WindowChrome />

      <div
        style={{
          marginTop: 16,
          whiteSpace: "pre",
          lineHeight: 1.7,
          letterSpacing: 0.3,
        }}
      >
        {/* Prompt + typing command */}
        <PromptLine sec={sec} fps={fps} frame={frame} />

        {/* Banner */}
        <Sequence from={Math.floor(T.bannerStart * fps)} layout="none">
          <BannerBlock />
        </Sequence>

        {/* Target info */}
        <Sequence from={Math.floor(T.targetInfo * fps)} layout="none">
          <FadeInLine>
            <Span color={C.dimmed}>Target:</Span>{" "}
            <Span color={C.fg}>https://demo.app/api/chat</Span>
          </FadeInLine>
          <FadeInLine delay={6}>
            <Span color={C.dimmed}>Mode:</Span>{" "}
            <Span color={C.fg}>full scan</Span>
            <Span color={C.dimmed}> · </Span>
            <Span color={C.dimmed}>Model:</Span>{" "}
            <Span color={C.fg}>claude-sonnet-4-20250514</Span>
          </FadeInLine>
        </Sequence>

        {/* Discovery stage */}
        <Sequence from={Math.floor(T.discoveryStart * fps)} layout="none">
          <DiscoveryLine sec={sec} fps={fps} />
        </Sequence>

        {/* Attack progress */}
        <Sequence from={Math.floor(T.attackStart * fps)} layout="none">
          <AttackProgress sec={sec} fps={fps} frame={frame} />
        </Sequence>

        {/* Findings */}
        <Sequence from={Math.floor(T.finding1 * fps)} layout="none">
          <FindingsBlock sec={sec} fps={fps} />
        </Sequence>

        {/* Summary box */}
        <Sequence from={Math.floor(T.summaryStart * fps)} layout="none">
          <SummaryBox frame={frame} fps={fps} />
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};

// ── Window Chrome ──
const WindowChrome = () => (
  <div
    style={{
      display: "flex",
      gap: 8,
      alignItems: "center",
      paddingBottom: 12,
      borderBottom: `1px solid ${C.border}`,
    }}
  >
    <div style={{ width: 12, height: 12, borderRadius: 6, background: "#ff5f56" }} />
    <div style={{ width: 12, height: 12, borderRadius: 6, background: "#ffbd2e" }} />
    <div style={{ width: 12, height: 12, borderRadius: 6, background: "#27c93f" }} />
    <div style={{ flex: 1 }} />
    <span style={{ color: C.dimmed, fontSize: 13 }}>Terminal</span>
    <div style={{ flex: 1 }} />
  </div>
);

// ── Prompt line with typewriter ──
const PromptLine = ({
  sec,
  fps,
  frame,
}: {
  sec: number;
  fps: number;
  frame: number;
}) => {
  const typeDuration = T.typeEnd - T.typeStart;
  const progress = Math.min(
    1,
    Math.max(0, (sec - T.typeStart) / typeDuration)
  );
  const charsVisible = Math.floor(progress * COMMAND.length);
  const showCursor = sec < T.bannerStart && Math.floor(frame / 8) % 2 === 0;

  return (
    <div>
      <Span color={C.prompt}>{"❯"}</Span>{" "}
      <Span color={C.fg}>{COMMAND.slice(0, charsVisible)}</Span>
      {showCursor && (
        <Span
          color={C.cursor}
          style={{ background: C.cursor, color: C.bg, padding: "0 1px" }}
        >
          {" "}
        </Span>
      )}
    </div>
  );
};

// ── Banner block ──
const BannerBlock = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 0.3 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ opacity, marginTop: 8, marginBottom: 4 }}>
      <div>
        <Span color={C.red} style={{ fontWeight: 700, fontSize: 18 }}>
          {"  ◆ nightfang"}
        </Span>
        <Span color={C.dimmed}> v0.1.0</Span>
      </div>
      <div style={{ marginBottom: 4 }}>
        <Span color={C.dimmed}>{"  AI-powered security scanner"}</Span>
      </div>
    </div>
  );
};

// ── Discovery line ──
const DiscoveryLine = ({ sec, fps }: { sec: number; fps: number }) => {
  const frame = useCurrentFrame();
  const done = sec >= T.discoveryDone;
  const spin = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const spinIdx = Math.floor(frame / 3) % spin.length;

  const opacity = interpolate(frame, [0, 0.2 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ opacity, marginTop: 4 }}>
      {done ? (
        <>
          <Span color={C.green}>{"  ✓"}</Span>
          <Span color={C.fg}>{" Discovery"}</Span>
          <Span color={C.dimmed}>
            {" — found 8 endpoints, 3 input vectors"}
          </Span>
        </>
      ) : (
        <>
          <Span color={C.cyan}>{"  " + spin[spinIdx]}</Span>
          <Span color={C.fg}>{" Discovering endpoints..."}</Span>
        </>
      )}
    </div>
  );
};

// ── Attack progress bar ──
const AttackProgress = ({
  sec,
  fps,
  frame,
}: {
  sec: number;
  fps: number;
  frame: number;
}) => {
  const localFrame = useCurrentFrame();
  const attackDuration = T.attackEnd - T.attackStart;
  const progress = Math.min(1, Math.max(0, (sec - T.attackStart) / attackDuration));
  const totalProbes = 47;
  const currentProbe = Math.floor(progress * totalProbes);
  const barWidth = 30;
  const filled = Math.round(progress * barWidth);
  const empty = barWidth - filled;
  const pct = Math.round(progress * 100);

  const opacity = interpolate(localFrame, [0, 0.2 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ opacity, marginTop: 4 }}>
      <Span color={C.dimmed}>{"  Attack "}</Span>
      <Span color={C.red}>{"█".repeat(filled)}</Span>
      <Span color={C.dimmed}>{"░".repeat(empty)}</Span>
      <Span color={C.fg} style={{ fontWeight: 700 }}>
        {" " + pct}
      </Span>
      <Span color={C.dimmed}>
        {"% (" + currentProbe + "/" + totalProbes + ")"}
      </Span>
    </div>
  );
};

// ── Findings ──
type FindingData = {
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  bgColor: string;
  textColor: string;
  title: string;
  category: string;
  confirmed: boolean;
};

const findings: FindingData[] = [
  {
    severity: "CRITICAL",
    bgColor: C.redBg,
    textColor: "#ffffff",
    title: "System Prompt Extraction via Instruction Override",
    category: "Prompt Injection",
    confirmed: true,
  },
  {
    severity: "CRITICAL",
    bgColor: C.redBg,
    textColor: "#ffffff",
    title: "Indirect Prompt Injection via Retrieved Context",
    category: "Prompt Injection",
    confirmed: true,
  },
  {
    severity: "CRITICAL",
    bgColor: C.redBg,
    textColor: "#ffffff",
    title: "Tool Call Manipulation — Unauthorized API Access",
    category: "Tool Abuse",
    confirmed: true,
  },
  {
    severity: "HIGH",
    bgColor: C.orangeBg,
    textColor: "#ffffff",
    title: "PII Leakage Through Conversation History",
    category: "Data Leakage",
    confirmed: true,
  },
  {
    severity: "MEDIUM",
    bgColor: C.yellowBg,
    textColor: "#000000",
    title: "Excessive Token Consumption via Recursive Prompts",
    category: "Denial Of Service",
    confirmed: false,
  },
];

const findingTimes = [T.finding1, T.finding2, T.finding3, T.finding4, T.finding5];

const FindingsBlock = ({ sec, fps }: { sec: number; fps: number }) => {
  return (
    <div style={{ marginTop: 12 }}>
      <Sequence from={0} layout="none">
        <FindingsHeader />
      </Sequence>
      {findings.map((f, i) => {
        const delay = Math.floor((findingTimes[i] - T.finding1) * fps);
        return (
          <Sequence key={i} from={delay} layout="none">
            <FindingCard finding={f} />
          </Sequence>
        );
      })}
    </div>
  );
};

const FindingsHeader = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 0.2 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ opacity, marginBottom: 6 }}>
      <Span color={C.fg} style={{ fontWeight: 700 }}>
        {"  FINDINGS"}
      </Span>
    </div>
  );
};

const FindingCard = ({ finding }: { finding: FindingData }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 0.2 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(frame, [0, 0.3 * fps], [8, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        marginBottom: 2,
      }}
    >
      {"  "}
      <span
        style={{
          backgroundColor: finding.bgColor,
          color: finding.textColor,
          fontWeight: 700,
          fontSize: 13,
          padding: "1px 8px",
          borderRadius: 3,
          display: "inline-block",
          minWidth: 80,
          textAlign: "center",
        }}
      >
        {finding.severity}
      </span>
      {"  "}
      <Span color={C.fg} style={{ fontWeight: 700 }}>
        {finding.title}
      </Span>
      {"\n"}
      {"             "}
      <Span color={C.dimmed}>{"Category: "}</Span>
      <Span color={C.fg}>{finding.category}</Span>
      {finding.confirmed && (
        <>
          <Span color={C.dimmed}>{" · "}</Span>
          <Span color={C.green}>{"✓ Confirmed"}</Span>
        </>
      )}
      {"\n"}
    </div>
  );
};

// ── Summary Box ──
const SummaryBox = ({ frame, fps }: { frame: number; fps: number }) => {
  const localFrame = useCurrentFrame();
  const opacity = interpolate(localFrame, [0, 0.4 * fps], [0, 1], {
    extrapolateRight: "clamp",
  });

  const W = 58;
  const h = "─";
  const top = "  ╭" + h.repeat(W) + "╮";
  const bot = "  ╰" + h.repeat(W) + "╯";
  const div = "  ├" + h.repeat(W) + "┤";

  const pad = (s: string, len: number) => {
    const padLen = Math.max(0, len - s.length);
    return s + " ".repeat(padLen);
  };

  return (
    <div style={{ opacity, marginTop: 8 }}>
      <Span color={C.border}>{top}</Span>
      {"\n"}
      <Span color={C.border}>{"  │ "}</Span>
      <Span color={C.fg} style={{ fontWeight: 700 }}>
        {pad("SUMMARY", W - 1)}
      </Span>
      <Span color={C.border}>{"│"}</Span>
      {"\n"}
      <Span color={C.border}>{div}</Span>
      {"\n"}
      <Span color={C.border}>{"  │ "}</Span>
      <SeverityDot color={C.red} />
      <Span color={C.red} style={{ fontWeight: 700 }}>
        {" 3"}
      </Span>
      <Span color={C.dimmed}>{" Critical  "}</Span>
      <SeverityDot color={C.orangeBg} />
      <Span color={C.orangeBg} style={{ fontWeight: 700 }}>
        {" 1"}
      </Span>
      <Span color={C.dimmed}>{" High  "}</Span>
      <SeverityDot color={C.yellowBg} />
      <Span color={C.yellowBg} style={{ fontWeight: 700 }}>
        {" 1"}
      </Span>
      <Span color={C.dimmed}>{" Medium                  "}</Span>
      <Span color={C.border}>{"│"}</Span>
      {"\n"}
      <Span color={C.border}>{"  │ "}</Span>
      <Span color={C.dimmed}>{"                                                          "}</Span>
      <Span color={C.border}>{"│"}</Span>
      {"\n"}
      <Span color={C.border}>{"  │ "}</Span>
      <Span color={C.fg} style={{ fontWeight: 700 }}>
        {"5"}
      </Span>
      <Span color={C.dimmed}>{" findings"}</Span>
      <Span color={C.dimmed}>{"  │  "}</Span>
      <Span color={C.fg} style={{ fontWeight: 700 }}>
        {"47"}
      </Span>
      <Span color={C.dimmed}>{" probes"}</Span>
      <Span color={C.dimmed}>{"  │  "}</Span>
      <Span color={C.fg} style={{ fontWeight: 700 }}>
        {"12.4s"}
      </Span>
      <Span color={C.dimmed}>{"                        "}</Span>
      <Span color={C.border}>{"│"}</Span>
      {"\n"}
      <Span color={C.border}>{bot}</Span>
    </div>
  );
};

const SeverityDot = ({ color }: { color: string }) => (
  <span style={{ color }}>{"●"}</span>
);

// ── Utility components ──
const Span = ({
  color,
  style,
  children,
}: {
  color: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) => <span style={{ color, ...style }}>{children}</span>;

const FadeInLine = ({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame - delay, [0, 0.2 * fps], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  return <div style={{ opacity }}>{children}</div>;
};
