import hljs from 'highlight.js/lib/common';
import { RESET, RED, GREEN, BLUE, GREY, YELLOW, CYAN, PURPLE } from './ansi';

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
  'hljs-keyword':  BLUE,
  'hljs-string':   GREEN,
  'hljs-comment':  GREY,
  'hljs-number':   YELLOW,
  'hljs-title':    CYAN,
  'hljs-built_in': CYAN,
  'hljs-literal':  YELLOW,
  'hljs-type':     PURPLE,
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

function classToAnsi(cls: string, lineColor: string): string {
  if (lineColor && cls === 'hljs-string') return lineColor;
  return HLJS_CLASS_TO_ANSI[cls] ?? lineColor;
}

export function htmlToAnsi(html: string, lineColor: string): string {
  const withSpans = html
    .replace(/<span class="([^"]+)">/g, (_, cls) => classToAnsi(cls, lineColor))
    .replace(/<\/span>/g, `${RESET}${lineColor}`);
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
    oldLine:  parseInt(m[1], 10),
    oldCount: m[2] !== undefined ? parseInt(m[2], 10) : 1,
    newLine:  parseInt(m[3], 10),
    newCount: m[4] !== undefined ? parseInt(m[4], 10) : 1,
  };
}

// ── Gutter formatting ──────────────────────────────────────────────────────────────

const formatLineNum = (n: number | null, width: number): string =>
  n !== null ? String(n).padStart(width) : ' '.repeat(width);

const formatGutter = (old: number | null, newN: number | null, width: number): string =>
  `${formatLineNum(old, width)} ${formatLineNum(newN, width)}`;

// ── Diff state ──────────────────────────────────────────────────────────────────

type DiffState = {
  readonly oldLine:  number;
  readonly newLine:  number;
  readonly width:    number;
  readonly language: string | null;
  readonly output:   readonly string[];
};

// ── Line renderers ──────────────────────────────────────────────────────────────

const renderCode = (code: string, lineColor: string, language: string | null): string =>
  htmlToAnsi(syntaxHighlight(code, language), lineColor);

function processAddition(state: DiffState, line: string): DiffState {
  const code    = line.slice(1);
  const gutter  = formatGutter(null, state.newLine, state.width);
  const rendered = renderCode(code, GREEN, state.language);
  return {
    ...state,
    newLine: state.newLine + 1,
    output:  [...state.output, `${GREEN}${gutter} +${rendered}${RESET}`],
  };
}

function processRemoval(state: DiffState, line: string): DiffState {
  const code    = line.slice(1);
  const gutter  = formatGutter(state.oldLine, null, state.width);
  const rendered = renderCode(code, RED, state.language);
  return {
    ...state,
    oldLine: state.oldLine + 1,
    output:  [...state.output, `${RED}${gutter} -${rendered}${RESET}`],
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
    output:  [...state.output, `${gutter}  ${rendered}`],
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
  const language = getLanguage(filePath);
  const lines    = diffText.split('\n');
  const width    = String(computeMaxLine(lines)).length;
  const initial: DiffState = {
    oldLine: 1, newLine: 1, width, language, output: [],
  };
  return lines.reduce(processOneLine, initial).output.join('\n');
}
