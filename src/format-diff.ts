import hljs from 'highlight.js/lib/common';
import {
  RESET, RED, GREEN, BLUE, GREY, YELLOW, CYAN, PURPLE, LIGHT_BLUE, LIGHT_GREY, DIM,
  RESET_FG, RESET_DIM, BG_DIFF_ADD, BG_DIFF_REMOVE,
} from './ansi';

// ── Extension → language map ──────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',  tsx: 'typescript',
  js: 'javascript',  jsx: 'javascript',  mjs: 'javascript',  cjs: 'javascript',
  py: 'python',      pyw: 'python',
  rs: 'rust',        go: 'go',           java: 'java',
  css: 'css',        scss: 'scss',       less: 'less',
  html: 'html',      htm: 'html',        xml: 'xml',
  json: 'json',      md: 'markdown',     sql: 'sql',
  sh: 'bash',        bash: 'bash',       yaml: 'yaml',  yml: 'yaml',
  c: 'c',            h: 'c',             cpp: 'cpp',    cc: 'cpp',   cxx: 'cpp',
  rb: 'ruby',        php: 'php',         swift: 'swift',
  kt: 'kotlin',      cs: 'csharp',       lua: 'lua',
};

// ── hljs class → ANSI color map ───────────────────────────────────────────────

const HLJS_CLASS_TO_ANSI: Record<string, string> = {
  // Core tokens
  'hljs-keyword':   BLUE,
  'hljs-string':    GREEN,
  'hljs-comment':   GREY,
  'hljs-number':    YELLOW,
  'hljs-literal':   YELLOW,
  'hljs-type':      PURPLE,

  // Names & identifiers
  'hljs-title':     CYAN,
  'hljs-title function_': CYAN,
  'hljs-title class_':    YELLOW,
  'hljs-built_in':  CYAN,
  'hljs-function':  CYAN,
  'hljs-symbol':    YELLOW,

  // Properties & variables
  'hljs-property':          LIGHT_BLUE,
  'hljs-attr':              LIGHT_BLUE,
  'hljs-attribute':         LIGHT_BLUE,
  'hljs-variable':          LIGHT_BLUE,
  'hljs-template-variable': LIGHT_BLUE,
  'hljs-params':            LIGHT_GREY,

  // Markup & selectors
  'hljs-tag':              BLUE,
  'hljs-name':             BLUE,
  'hljs-selector-tag':     BLUE,
  'hljs-selector-class':   GREEN,
  'hljs-selector-id':      YELLOW,
  'hljs-selector-pseudo':  PURPLE,

  // Meta & docs
  'hljs-meta':    GREY,
  'hljs-doctag':  GREY,
  'hljs-regexp':  RED,
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function getLanguage(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_LANG[ext] ?? null;
}

export function decodeEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function classToAnsi(cls: string): string {
  const direct = HLJS_CLASS_TO_ANSI[cls];
  if (direct) return direct;
  const first = cls.split(' ')[0];
  if (first) return HLJS_CLASS_TO_ANSI[first] ?? '';
  return '';
}

export function htmlToAnsi(html: string, baseline: string): string {
  const restore = RESET_FG ? `${RESET_FG}${baseline}` : baseline;
  const withSpans = html
    .replace(/<span class="([^"]+)">/g, (_, cls) => classToAnsi(cls))
    .replace(/<\/span>/g, restore);
  return decodeEntities(withSpans);
}

export function syntaxHighlight(code: string, language: string | null): string {
  try {
    const result = language
      ? hljs.highlight(code, { language })
      : hljs.highlightAuto(code);
    return result.value;
  } catch {
    return code;
  }
}

// ── Hunk header parsing ───────────────────────────────────────────────────────────

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export type HunkNumbers = {
  readonly oldLine:  number;
  readonly oldCount: number;
  readonly newLine:  number;
  readonly newCount: number;
};

export function parseHunkHeader(line: string): HunkNumbers | null {
  const m = HUNK_HEADER_RE.exec(line);
  if (!m) return null;
  return {
    oldLine:  parseInt(m[1]!, 10),
    oldCount: m[2] !== undefined ? parseInt(m[2], 10) : 1,
    newLine:  parseInt(m[3]!, 10),
    newCount: m[4] !== undefined ? parseInt(m[4], 10) : 1,
  };
}

// ── Gutter formatting ──────────────────────────────────────────────────────────────

const formatLineNum = (n: number | null, width: number): string =>
  n !== null ? String(n).padStart(width) : ' '.repeat(width);

const formatGutter = (old: number | null, newN: number | null, width: number): string =>
  `${formatLineNum(old, width)} ${formatLineNum(newN, width)} \u2502`;

// ── Diff state ──────────────────────────────────────────────────────────────────

type DiffState = {
  readonly oldLine:  number;
  readonly newLine:  number;
  readonly width:    number;
  readonly language: string | null;
  readonly termWidth: number;
  readonly output:   readonly string[];
};

// ── ANSI-aware padding ──────────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function visibleLength(s: string): number {
  return s.replace(ANSI_RE, '').length;
}

function padToWidth(line: string, width: number, bg: string): string {
  if (!bg) return line;
  const visible = visibleLength(line);
  const pad = Math.max(0, width - visible);
  return pad > 0 ? line + ' '.repeat(pad) : line;
}

// ── Line renderers ──────────────────────────────────────────────────────────────

const renderCode = (code: string, baseline: string, language: string | null): string =>
  htmlToAnsi(syntaxHighlight(code, language), baseline);

function processAddition(state: DiffState, line: string): DiffState {
  const code    = line.slice(1);
  const gutter  = formatGutter(null, state.newLine, state.width);
  const bg      = BG_DIFF_ADD;

  let formatted: string;
  if (bg) {
    const rendered = renderCode(code, bg, state.language);
    formatted = padToWidth(
      `${bg}${DIM}${gutter}${RESET_DIM}${bg} +${rendered}`,
      state.termWidth, bg,
    ) + RESET;
  } else {
    // Fallback for 16-color: foreground-only
    const rendered = renderCode(code, GREEN, state.language);
    formatted = `${GREEN}${gutter} +${rendered}${RESET}`;
  }

  return {
    ...state,
    newLine: state.newLine + 1,
    output:  [...state.output, formatted],
  };
}

function processRemoval(state: DiffState, line: string): DiffState {
  const code    = line.slice(1);
  const gutter  = formatGutter(state.oldLine, null, state.width);
  const bg      = BG_DIFF_REMOVE;

  let formatted: string;
  if (bg) {
    const rendered = renderCode(code, bg, state.language);
    formatted = padToWidth(
      `${bg}${DIM}${gutter}${RESET_DIM}${bg} -${rendered}`,
      state.termWidth, bg,
    ) + RESET;
  } else {
    const rendered = renderCode(code, RED, state.language);
    formatted = `${RED}${gutter} -${rendered}${RESET}`;
  }

  return {
    ...state,
    oldLine: state.oldLine + 1,
    output:  [...state.output, formatted],
  };
}

function processContext(state: DiffState, line: string): DiffState {
  const code    = line.slice(1);
  const gutter  = formatGutter(state.oldLine, state.newLine, state.width);
  const rendered = renderCode(code, '', state.language);
  return {
    ...state,
    oldLine: state.oldLine + 1,
    newLine: state.newLine + 1,
    output:  [...state.output, `${DIM}${gutter}${RESET_DIM}  ${rendered}`],
  };
}

function processHunk(state: DiffState, line: string): DiffState {
  const hunk = parseHunkHeader(line);
  if (!hunk) return state;
  return { ...state, oldLine: hunk.oldLine, newLine: hunk.newLine };
}

// ── Line classifier ──────────────────────────────────────────────────────────────

const isFileHeader = (line: string): boolean =>
  line.startsWith('--- ') || line.startsWith('+++ ');

function processOneLine(state: DiffState, line: string): DiffState {
  if (isFileHeader(line))      return state;
  if (line.startsWith('@@ '))  return processHunk(state, line);
  if (line.startsWith('+'))    return processAddition(state, line);
  if (line.startsWith('-'))    return processRemoval(state, line);
  if (line.startsWith(' '))    return processContext(state, line);
  return state;
}

// ── Width computation ────────────────────────────────────────────────────────────

function computeMaxLine(lines: readonly string[]): number {
  return lines.reduce((max, line) => {
    const hunk = parseHunkHeader(line);
    if (!hunk) return max;
    return Math.max(max, hunk.oldLine + hunk.oldCount, hunk.newLine + hunk.newCount);
  }, 1);
}

// ── Main export ──────────────────────────────────────────────────────────────────

export function formatDiff(diffText: string, filePath: string): string {
  const language  = getLanguage(filePath);
  const lines     = diffText.split('\n');
  const width     = String(computeMaxLine(lines)).length;
  const termWidth = process.stdout.columns ?? 80;
  const initial: DiffState = {
    oldLine: 1, newLine: 1, width, language, termWidth, output: [],
  };
  return lines.reduce(processOneLine, initial).output.join('\n');
}
