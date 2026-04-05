/** Approximate cost per 1M tokens by provider/model */
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.4": { input: 2.50, output: 10.00 },
  "gpt-4o": { input: 2.50, output: 10.00 },
  "claude-sonnet-4-6": { input: 3.00, output: 15.00 },
  "claude-opus-4-6": { input: 15.00, output: 75.00 },
  "claude-haiku-4-5": { input: 0.80, output: 4.00 },
  default: { input: 3.00, output: 15.00 },
};

export function estimateCost(
  usage: { inputTokens: number; outputTokens: number },
  model?: string,
): number {
  const rates = PRICING[model ?? ""] ?? PRICING.default;
  return (
    (usage.inputTokens / 1_000_000) * rates.input +
    (usage.outputTokens / 1_000_000) * rates.output
  );
}
