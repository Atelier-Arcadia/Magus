// ── Color detection ──────────────────────────────────────────────────────────────────

type ColorEnv = {
  readonly FORCE_COLOR?: string;
  readonly NO_COLOR?: string;
  readonly isTTY?: boolean;
};

export function detectColor(env: ColorEnv): boolean {
  if (env.FORCE_COLOR !== undefined) return true;
  if (env.NO_COLOR !== undefined) return false;
  return !!env.isTTY;
}

// ── ANSI code builder ───────────────────────────────────────────────────────────

export function buildCodes(enabled: boolean) {
  const code = (seq: string): string => (enabled ? seq : "");
  return {
    RESET: code("\x1b[0m"),  BOLD: code("\x1b[1m"),  ITALIC: code("\x1b[3m"),  DIM:        code("\x1b[2m"),
    RED:   code("\x1b[31m"), PURPLE: code("\x1b[35m"), GREEN:  code("\x1b[32m"), BLUE:       code("\x1b[34m"),
    LIGHT_GREY: code("\x1b[37m"), GREY: code("\x1b[90m"), LIGHT_BLUE: code("\x1b[94m"),
    YELLOW: code("\x1b[33m"), CYAN: code("\x1b[36m"), GRAY: code("\x1b[90m"),
  };
}

// ── Module-level constants ────────────────────────────────────────────────────────────

export const colorEnabled = detectColor({
  FORCE_COLOR: process.env.FORCE_COLOR,
  NO_COLOR:    process.env.NO_COLOR,
  isTTY:       process.stdout.isTTY,
});

export const {
  RESET, BOLD, ITALIC, DIM,
  RED, PURPLE, GREEN, BLUE,
  LIGHT_GREY, GREY, LIGHT_BLUE,
  YELLOW, CYAN, GRAY,
} = buildCodes(colorEnabled);
