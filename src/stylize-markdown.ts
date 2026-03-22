// ── ANSI escape constants ────────────────────────────────────────────────────

export const RESET      = "\x1b[0m";
export const BOLD       = "\x1b[1m";
export const ITALIC     = "\x1b[3m";
export const DIM        = "\x1b[2m";
export const RED        = "\x1b[31m";
export const PURPLE     = "\x1b[35m";
export const GREEN      = "\x1b[32m";
export const BLUE       = "\x1b[34m";
export const LIGHT_GREY = "\x1b[37m";
export const GREY       = "\x1b[90m";
export const LIGHT_BLUE = "\x1b[94m";

// ── Heading style map ───────────────────────────────────────────────────────────

const HEADING_STYLES: Record<number, string> = {
  1: `${BOLD}${RED}`,
  2: `${BOLD}${PURPLE}`,
  3: `${BOLD}${GREEN}`,
  4: `${BOLD}${BLUE}`,
};

// ── Regex patterns ──────────────────────────────────────────────────────────────────

const ATX_RE         = /^(#{1,4}) (.+)/;
const BOLD_RE        = /\*\*(.+?)\*\*/g;
const ITALIC_RE      = /(?<!\w)_(.+?)_(?!\w)/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const LINK_RE        = /\[([^\]]+)\]\(([^)]+)\)/g;
const FENCE_RE       = /^```/;
const BLOCKQUOTE_RE  = /^> /;
const SETEXT_H1_RE   = /^=+\s*$/;
const SETEXT_H2_RE   = /^-+\s*$/;

// ── Render state ────────────────────────────────────────────────────────────────────

type RenderState = {
  readonly inCodeBlock: boolean;
  readonly lastRawLine: string;
  readonly outputLines: readonly string[];
};

const INITIAL_STATE: RenderState = {
  inCodeBlock: false,
  lastRawLine: "",
  outputLines: [],
};

// ── Parsing helpers ──────────────────────────────────────────────────────────────────

function parseAtxHeading(line: string): { level: number; text: string } | null {
  const m = ATX_RE.exec(line);
  return m ? { level: m[1].length, text: m[2] } : null;
}

function getSetextLevel(line: string): 1 | 2 | null {
  if (SETEXT_H1_RE.test(line)) return 1;
  if (SETEXT_H2_RE.test(line)) return 2;
  return null;
}

function isEligibleForSetext(line: string): boolean {
  return (
    line.trim().length > 0 &&
    !parseAtxHeading(line) &&
    !BLOCKQUOTE_RE.test(line)
  );
}

// ── Inline transformations ───────────────────────────────────────────────────────────

const applyBold = (line: string): string =>
  line.replace(BOLD_RE, `${BOLD}${LIGHT_BLUE}$1${RESET}`);

const applyItalic = (line: string): string =>
  line.replace(ITALIC_RE, `${ITALIC}${LIGHT_BLUE}$1${RESET}`);

const applyInlineCode = (line: string): string =>
  line.replace(INLINE_CODE_RE, `${RED}$1${RESET}`);

const applyLink = (line: string): string =>
  line.replace(LINK_RE, `$1 (${LIGHT_BLUE}$2${RESET})`);

const applyInlineStyles = (line: string): string =>
  applyInlineCode(applyItalic(applyBold(applyLink(line))));

// ── Line styling ─────────────────────────────────────────────────────────────────────

function styleHeading(level: number, text: string): string {
  return `${HEADING_STYLES[level] ?? BOLD}${text}${RESET}`;
}

function styleNonCodeLine(line: string): string {
  const heading = parseAtxHeading(line);
  if (heading) return styleHeading(heading.level, heading.text);
  if (BLOCKQUOTE_RE.test(line)) return `${GREY}${line}${RESET}`;
  return applyInlineStyles(line);
}

// ── State transitions ─────────────────────────────────────────────────────────────

function processFenceLine(state: RenderState, rawLine: string): RenderState {
  return {
    inCodeBlock: !state.inCodeBlock,
    lastRawLine: "",
    outputLines: [...state.outputLines, `${DIM}${rawLine}${RESET}`],
  };
}

function processCodeContentLine(state: RenderState, rawLine: string): RenderState {
  return {
    ...state,
    outputLines: [...state.outputLines, `${LIGHT_GREY}${rawLine}${RESET}`],
  };
}

function processSetextHeading(state: RenderState, level: 1 | 2): RenderState {
  return {
    inCodeBlock: false,
    lastRawLine: "",
    outputLines: [
      ...state.outputLines.slice(0, -1),
      styleHeading(level, state.lastRawLine),
    ],
  };
}

function processTextLine(state: RenderState, rawLine: string): RenderState {
  return {
    inCodeBlock: false,
    lastRawLine: isEligibleForSetext(rawLine) ? rawLine : "",
    outputLines: [...state.outputLines, styleNonCodeLine(rawLine)],
  };
}

function processNormalLine(state: RenderState, rawLine: string): RenderState {
  const setextLevel = getSetextLevel(rawLine);
  if (setextLevel !== null && state.lastRawLine.trim().length > 0) {
    return processSetextHeading(state, setextLevel);
  }
  return processTextLine(state, rawLine);
}

function processLine(state: RenderState, rawLine: string): RenderState {
  if (FENCE_RE.test(rawLine)) return processFenceLine(state, rawLine);
  if (state.inCodeBlock) return processCodeContentLine(state, rawLine);
  return processNormalLine(state, rawLine);
}

// ── Public API ────────────────────────────────────────────────────────────────────────

export function stylizeMarkdown(text: string): string {
  const finalState = text.split("\n").reduce(processLine, INITIAL_STATE);
  return finalState.outputLines.join("\n");
}
