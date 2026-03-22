// ── Color level detection ────────────────────────────────────────────────────

export type ColorEnv = {
  readonly FORCE_COLOR?: string;
  readonly NO_COLOR?: string;
  readonly COLORTERM?: string;
  readonly TERM_PROGRAM?: string;
  readonly TERM?: string;
  readonly isTTY?: boolean;
};

export type ColorLevel = 0 | 1 | 2 | 3;

const TRUECOLOR_TERMINALS = new Set(['iTerm.app', 'WezTerm', 'ghostty', 'vscode']);

export function detectColorLevel(env: ColorEnv): ColorLevel {
  if (env.FORCE_COLOR !== undefined) {
    const n = parseInt(env.FORCE_COLOR, 10);
    if (n >= 0 && n <= 3) return n as ColorLevel;
    return 3;
  }
  if (env.NO_COLOR !== undefined) return 0;
  if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit') return 3;
  if (env.TERM_PROGRAM && TRUECOLOR_TERMINALS.has(env.TERM_PROGRAM)) return 3;
  if (env.TERM?.includes('256color')) return 2;
  if (env.isTTY) return 1;
  return 0;
}

export function detectColor(env: ColorEnv): boolean {
  return detectColorLevel(env) > 0;
}

// ── ANSI code builder ───────────────────────────────────────────────────────────

export function buildCodes(enabled: boolean, level: ColorLevel = enabled ? 3 : 0) {
  const code = (seq: string): string => (enabled ? seq : "");
  const hiColor = (seq: string): string => (level >= 2 ? seq : "");
  return {
    RESET: code("\x1b[0m"),  BOLD: code("\x1b[1m"),  ITALIC: code("\x1b[3m"),  DIM:        code("\x1b[2m"),
    RED:   code("\x1b[31m"), PURPLE: code("\x1b[35m"), GREEN:  code("\x1b[32m"), BLUE:       code("\x1b[34m"),
    LIGHT_GREY: code("\x1b[37m"), GREY: code("\x1b[90m"), LIGHT_BLUE: code("\x1b[94m"),
    YELLOW: code("\x1b[33m"), CYAN: code("\x1b[36m"), GRAY: code("\x1b[90m"),
    // Partial resets
    RESET_FG:  code("\x1b[39m"),
    RESET_DIM: code("\x1b[22m"),
    // Diff background colors (require 256-color or truecolor)
    BG_DIFF_ADD:    level >= 3 ? "\x1b[48;2;30;50;30m" : hiColor("\x1b[48;5;22m"),
    BG_DIFF_REMOVE: level >= 3 ? "\x1b[48;2;50;30;30m" : hiColor("\x1b[48;5;52m"),
  };
}

// ── Module-level constants ────────────────────────────────────────────────────────────

export const colorLevel = detectColorLevel({
  FORCE_COLOR:  process.env.FORCE_COLOR,
  NO_COLOR:     process.env.NO_COLOR,
  COLORTERM:    process.env.COLORTERM,
  TERM_PROGRAM: process.env.TERM_PROGRAM,
  TERM:         process.env.TERM,
  isTTY:        process.stdout.isTTY,
});

export const colorEnabled = colorLevel > 0;

export const {
  RESET, BOLD, ITALIC, DIM,
  RED, PURPLE, GREEN, BLUE,
  LIGHT_GREY, GREY, LIGHT_BLUE,
  YELLOW, CYAN, GRAY,
  RESET_FG, RESET_DIM,
  BG_DIFF_ADD, BG_DIFF_REMOVE,
} = buildCodes(colorEnabled, colorLevel);
