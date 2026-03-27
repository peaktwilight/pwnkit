import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";

/**
 * Animated Nightfang fang/diamond icon.
 *
 * - Eyes blink periodically (opacity on the two circles)
 * - Subtle breathing pulse on the whole shape (scale 1.0 -> 1.03 -> 1.0)
 * - Crimson glow pulses behind the icon
 *
 * Designed for 320x320 @ 60fps, 3-second loop.
 */

const CRIMSON = "#DC2626";
const GLOW_COLOR = "rgba(220, 38, 38, 0.35)";

export const NightfangIcon: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Looping time (0 -> duration -> 0 -> ...)
  const loopFrame = frame % durationInFrames;
  const t = loopFrame / fps; // time in seconds
  const duration = durationInFrames / fps; // total duration in seconds

  // ── Breathing pulse: scale oscillates 1.0 -> 1.03 -> 1.0 over full loop ──
  const breathe = interpolate(
    Math.sin((2 * Math.PI * t) / duration),
    [-1, 1],
    [1.0, 1.03],
  );

  // ── Glow pulse: slightly offset from breathing ──
  const glowOpacity = interpolate(
    Math.sin((2 * Math.PI * t) / duration + 0.5),
    [-1, 1],
    [0.15, 0.45],
  );

  const glowScale = interpolate(
    Math.sin((2 * Math.PI * t) / duration + 0.5),
    [-1, 1],
    [0.9, 1.1],
  );

  // ── Eye blink: quick blink every ~1.2 seconds ──
  // Blink lasts ~0.1s (6 frames at 60fps)
  const blinkCycle = 1.2; // seconds between blinks
  const blinkPhase = t % blinkCycle;
  const blinkDuration = 0.1;

  let eyeOpacity: number;
  if (blinkPhase < blinkDuration) {
    // Blink down and back up
    eyeOpacity = interpolate(
      blinkPhase,
      [0, blinkDuration / 2, blinkDuration],
      [1, 0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  } else {
    eyeOpacity = 1;
  }

  // ── Secondary blink: offset to make it feel organic ──
  // The second eye sometimes blinks slightly after the first
  const blinkPhase2 = (t + 0.03) % blinkCycle;
  let eyeOpacity2: number;
  if (blinkPhase2 < blinkDuration) {
    eyeOpacity2 = interpolate(
      blinkPhase2,
      [0, blinkDuration / 2, blinkDuration],
      [1, 0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  } else {
    eyeOpacity2 = 1;
  }

  // ── Subtle stroke glow animation ──
  const strokeOpacity = interpolate(
    Math.sin((2 * Math.PI * t) / duration - 0.3),
    [-1, 1],
    [0.8, 1.0],
  );

  // ── Leg wobble: bottom points shift side to side ──
  const wobble = Math.sin((2 * Math.PI * t) / 0.8) * 1.2; // fast little waddle
  const legPath = `M8 12 L16 6 L24 12 L24 22 L${20 + wobble} 26 L16 ${22 + Math.abs(wobble) * 0.3} L${12 - wobble} 26 L8 22Z`;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0d1117",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Glow layer */}
      <div
        style={{
          position: "absolute",
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${GLOW_COLOR} 0%, transparent 70%)`,
          opacity: glowOpacity,
          transform: `scale(${glowScale})`,
        }}
      />

      {/* SVG fang icon */}
      <svg
        viewBox="6 5 20 22"
        width={260}
        height={260}
        style={{
          transform: `scale(${breathe})`,
          overflow: "visible",
        }}
      >
        {/* Drop shadow filter */}
        <defs>
          <filter id="fang-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" />
          </filter>
        </defs>

        {/* Glow outline (behind the main shape) */}
        <path
          d={legPath}
          fill="none"
          stroke={CRIMSON}
          strokeWidth="3"
          strokeLinejoin="round"
          filter="url(#fang-glow)"
          opacity={glowOpacity * 0.8}
        />

        {/* Main outline */}
        <path
          d={legPath}
          fill="none"
          stroke={CRIMSON}
          strokeWidth="2"
          strokeLinejoin="round"
          opacity={strokeOpacity}
        />

        {/* Left eye */}
        <circle
          cx="13"
          cy="16"
          r="1.5"
          fill={CRIMSON}
          opacity={eyeOpacity}
        />

        {/* Right eye */}
        <circle
          cx="19"
          cy="16"
          r="1.5"
          fill={CRIMSON}
          opacity={eyeOpacity2}
        />
      </svg>
    </AbsoluteFill>
  );
};
