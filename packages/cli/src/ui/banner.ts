import { VERSION } from "@pwnkit/shared";

// Lazy-loaded cfonts module (loaded once, cached)
let _cfonts: any = null;
let _cfontsLoaded = false;

/**
 * Pre-load cfonts so printBanner can be synchronous.
 * Call this early (e.g. during CLI startup) before Ink takes over.
 */
export async function preloadBanner(): Promise<void> {
  if (_cfontsLoaded) return;
  _cfontsLoaded = true;
  try {
    _cfonts = (await import("cfonts")).default;
  } catch {
    _cfonts = null;
  }
}

/**
 * Print the pwnkit banner. Must be synchronous — called right before
 * Ink takes over the terminal. Call preloadBanner() first if you want
 * the fancy font; otherwise falls back to plain text.
 */
export function printBanner(subtitle?: string): void {
  const r = "\x1b[31m";
  const d = "\x1b[2m";
  const b = "\x1b[1m";
  const x = "\x1b[0m";

  console.log("");
  if (_cfonts) {
    try {
      _cfonts.say(`pwnkit|v${VERSION}`, {
        font: "tiny",
        colors: ["red", "gray"],
        space: false,
      });
    } catch {
      console.log(`  ${r}${b}pwnkit${x} ${d}v${VERSION}${x}`);
    }
  } else {
    console.log(`  ${r}${b}pwnkit${x} ${d}v${VERSION}${x}`);
  }
  if (subtitle) {
    console.log(`  ${d}${subtitle}${x}`);
  }
  console.log("");
}
