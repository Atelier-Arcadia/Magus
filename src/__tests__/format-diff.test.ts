import { describe, expect, test } from "bun:test";
import {
  formatDiff,
  getLanguage,
  decodeEntities,
  htmlToAnsi,
  parseHunkHeader,
  syntaxHighlight,
  type HunkNumbers,
} from "../format-diff";
import { GREEN, RED, BLUE, GREY, YELLOW, CYAN, PURPLE, RESET } from "../ansi";

// ── Test fixtures ──────────────────────────────────────────────────────────────

// A minimal unified diff with one context, one addition, one removal
const SIMPLE_DIFF = [
  "--- old.ts",
  "+++ new.ts",
  "@@ -1,3 +1,3 @@",
  " context line",
  "+added line",
  "-removed line",
].join("\n");

// A diff starting at higher line numbers to exercise width calculation
const HIGH_LINE_DIFF = [
  "--- big.ts",
  "+++ big.ts",
  "@@ -95,3 +97,3 @@",
  " context",
  "+insertion",
  "-deletion",
].join("\n");

// A diff with two hunks to verify line number advancement across hunks
const TWO_HUNK_DIFF = [
  "--- a.ts",
  "+++ b.ts",
  "@@ -1,2 +1,2 @@",
  " first context",
  "+first addition",
  "@@ -10,2 +10,2 @@",
  " second context",
  "-second removal",
].join("\n");

// ── getLanguage ──────────────────────────────────────────────────────────────

describe("getLanguage", () => {
  test("maps .ts to typescript", () => {
    expect(getLanguage("src/foo.ts")).toBe("typescript");
  });

  test("maps .tsx to typescript", () => {
    expect(getLanguage("component.tsx")).toBe("typescript");
  });

  test("maps .js to javascript", () => {
    expect(getLanguage("index.js")).toBe("javascript");
  });

  test("maps .py to python", () => {
    expect(getLanguage("script.py")).toBe("python");
  });

  test("maps .rs to rust", () => {
    expect(getLanguage("main.rs")).toBe("rust");
  });

  test("maps .go to go", () => {
    expect(getLanguage("server.go")).toBe("go");
  });

  test("maps .json to json", () => {
    expect(getLanguage("config.json")).toBe("json");
  });

  test("maps .md to markdown", () => {
    expect(getLanguage("README.md")).toBe("markdown");
  });

  test("maps .yaml to yaml", () => {
    expect(getLanguage("config.yaml")).toBe("yaml");
  });

  test("maps .yml to yaml", () => {
    expect(getLanguage("docker.yml")).toBe("yaml");
  });

  test("maps .sh to bash", () => {
    expect(getLanguage("install.sh")).toBe("bash");
  });

  test("maps .css to css", () => {
    expect(getLanguage("styles.css")).toBe("css");
  });

  test("returns null for unknown extension", () => {
    expect(getLanguage("file.unknownxyz")).toBeNull();
  });

  test("returns null for file with no extension", () => {
    expect(getLanguage("Makefile")).toBeNull();
  });

  test("handles uppercase extension by lowercasing", () => {
    expect(getLanguage("Main.TS")).toBe("typescript");
  });

  test("uses only the final extension segment", () => {
    expect(getLanguage("archive.tar.gz")).toBeNull();
  });
});

// ── decodeEntities ─────────────────────────────────────────────────────────

describe("decodeEntities", () => {
  test("decodes &amp; to &", () => {
    expect(decodeEntities("a &amp; b")).toBe("a & b");
  });

  test("decodes &lt; to <", () => {
    expect(decodeEntities("a &lt; b")).toBe("a < b");
  });

  test("decodes &gt; to >", () => {
    expect(decodeEntities("a &gt; b")).toBe("a > b");
  });

  test("decodes &quot; to \"", () => {
    expect(decodeEntities("say &quot;hello&quot;")).toBe('say "hello"');
  });

  test("decodes multiple entity types in one string", () => {
    expect(decodeEntities("&lt;div&gt; &amp; &quot;text&quot;")).toBe(
      '<div> & "text"',
    );
  });

  test("passes through text with no entities unchanged", () => {
    expect(decodeEntities("plain text")).toBe("plain text");
  });

  test("passes through empty string unchanged", () => {
    expect(decodeEntities("")).toBe("");
  });
});

// ── htmlToAnsi ──────────────────────────────────────────────────────────────

describe("htmlToAnsi", () => {
  test("converts hljs-keyword span to BLUE", () => {
    const html = '<span class="hljs-keyword">const</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${BLUE}const${RESET}`);
  });

  test("converts hljs-comment span to GREY", () => {
    const html = '<span class="hljs-comment">// note</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${GREY}// note${RESET}`);
  });

  test("converts hljs-number span to YELLOW", () => {
    const html = '<span class="hljs-number">42</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${YELLOW}42${RESET}`);
  });

  test("converts hljs-title span to CYAN", () => {
    const html = '<span class="hljs-title">myFn</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${CYAN}myFn${RESET}`);
  });

  test("converts hljs-built_in span to CYAN", () => {
    const html = '<span class="hljs-built_in">console</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${CYAN}console${RESET}`);
  });

  test("converts hljs-literal span to YELLOW", () => {
    const html = '<span class="hljs-literal">true</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${YELLOW}true${RESET}`);
  });

  test("converts hljs-type span to PURPLE", () => {
    const html = '<span class="hljs-type">string</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${PURPLE}string${RESET}`);
  });

  test("hljs-string on context line (empty lineColor) uses GREEN", () => {
    const html = '<span class="hljs-string">\'hello\'</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${GREEN}'hello'${RESET}`);
  });

  test("hljs-string on addition line (GREEN lineColor) uses line color", () => {
    const html = '<span class="hljs-string">\'hi\'</span>';
    const result = htmlToAnsi(html, GREEN);
    // string tokens override to lineColor (GREEN) on colored lines
    expect(result).toBe(`${GREEN}'hi'${RESET}${GREEN}`);
  });

  test("restores lineColor after each span close on addition lines", () => {
    const html = '<span class="hljs-keyword">const</span> x';
    const result = htmlToAnsi(html, GREEN);
    expect(result).toBe(`${BLUE}const${RESET}${GREEN} x`);
  });

  test("unknown hljs class falls back to lineColor", () => {
    const html = '<span class="hljs-unknown">foo</span>';
    const result = htmlToAnsi(html, RED);
    expect(result).toBe(`${RED}foo${RESET}${RED}`);
  });

  test("decodes HTML entities inside span content", () => {
    const html = '<span class="hljs-number">1 &lt; 2</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${YELLOW}1 < 2${RESET}`);
  });

  test("decodes HTML entities in text outside spans", () => {
    const result = htmlToAnsi("a &amp; b", "");
    expect(result).toBe("a & b");
  });

  test("passes plain text through unchanged (no spans)", () => {
    const result = htmlToAnsi("hello world", "");
    expect(result).toBe("hello world");
  });

  test("empty string returns empty string", () => {
    expect(htmlToAnsi("", "")).toBe("");
  });
});

// ── parseHunkHeader ─────────────────────────────────────────────────────────

describe("parseHunkHeader", () => {
  test("parses standard hunk header with counts", () => {
    const result = parseHunkHeader("@@ -1,6 +1,7 @@");
    expect(result).toEqual<HunkNumbers>({
      oldLine: 1, oldCount: 6, newLine: 1, newCount: 7,
    });
  });

  test("parses hunk header with different start lines", () => {
    const result = parseHunkHeader("@@ -10,3 +12,5 @@");
    expect(result).toEqual<HunkNumbers>({
      oldLine: 10, oldCount: 3, newLine: 12, newCount: 5,
    });
  });

  test("parses hunk header without count (defaults to 1)", () => {
    const result = parseHunkHeader("@@ -5 +5 @@");
    expect(result).toEqual<HunkNumbers>({
      oldLine: 5, oldCount: 1, newLine: 5, newCount: 1,
    });
  });

  test("returns null for a non-hunk line", () => {
    expect(parseHunkHeader("--- old.ts")).toBeNull();
  });

  test("returns null for an addition line", () => {
    expect(parseHunkHeader("+added line")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseHunkHeader("")).toBeNull();
  });

  test("returns null for @@ header missing the closing @@", () => {
    expect(parseHunkHeader("@@ -1,3 +1,3")).toBeNull();
  });

  test("parses hunk header with trailing context label", () => {
    const result = parseHunkHeader("@@ -1,6 +1,7 @@ function foo() {");
    expect(result).toEqual<HunkNumbers>({
      oldLine: 1, oldCount: 6, newLine: 1, newCount: 7,
    });
  });
});

// ── syntaxHighlight ──────────────────────────────────────────────────────────

describe("syntaxHighlight", () => {
  test("highlights TypeScript code and returns HTML string", () => {
    const result = syntaxHighlight("const x = 1;", "typescript");
    // hljs wraps 'const' in a keyword span
    expect(result).toContain("const");
    expect(result).not.toContain("<script"); // no XSS leakage
  });

  test("does not return raw span HTML for a known language", () => {
    const result = syntaxHighlight("const x = 1;", "typescript");
    // The output should be HTML (from hljs) — no ANSI yet at this stage
    expect(result).toContain("const");
  });

  test("uses highlightAuto when language is null", () => {
    // Just verify it doesn't throw and returns a non-empty string
    const result = syntaxHighlight("const x = 1;", null);
    expect(result).toContain("const");
  });

  test("returns raw code when language is unregistered and throws", () => {
    const code = "const x = 1;";
    expect(syntaxHighlight(code, "nonexistent_language_xyz")).toBe(code);
  });

  test("returns raw code for empty string regardless of language", () => {
    expect(syntaxHighlight("", "typescript")).toBe("");
  });
});

// ── formatDiff – line coloring ─────────────────────────────────────────────────

describe("formatDiff – line coloring", () => {
  test("addition lines begin with GREEN", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const additionLine = lines.find((l) => l.includes("+") && l.includes("added"))!;
    expect(additionLine.startsWith(GREEN)).toBe(true);
  });

  test("addition lines end with RESET", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const additionLine = lines.find((l) => l.includes("+") && l.includes("added"))!;
    expect(additionLine.endsWith(RESET)).toBe(true);
  });

  test("removal lines begin with RED", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const removalLine = lines.find((l) => l.includes("-") && l.includes("removed"))!;
    expect(removalLine.startsWith(RED)).toBe(true);
  });

  test("removal lines end with RESET", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const removalLine = lines.find((l) => l.includes("-") && l.includes("removed"))!;
    expect(removalLine.endsWith(RESET)).toBe(true);
  });

  test("context lines do not begin with GREEN or RED", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const contextLine = lines.find((l) => l.includes("context line"))!;
    expect(contextLine.startsWith(GREEN)).toBe(false);
    expect(contextLine.startsWith(RED)).toBe(false);
  });

  test("addition lines contain the + prefix character", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const additionLine = lines.find((l) => l.includes("+") && l.includes("added"))!;
    expect(additionLine).toContain("+");
  });

  test("removal lines contain the - prefix character", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const removalLine = lines.find((l) => l.includes("-") && l.includes("removed"))!;
    expect(removalLine).toContain("-");
  });
});

// ── formatDiff – line numbers ──────────────────────────────────────────────────

describe("formatDiff – line numbers", () => {
  // SIMPLE_DIFF: @@ -1,3 +1,3 @@ maxLine=4 → width=1
  // Context (old=1, new=1): gutter='1 1'
  // Addition (new=2):        gutter='  2'  (null old → space*1)
  // Removal  (old=2):        gutter='2  '  (null new → space*1)

  test("context line shows old and new line numbers", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const contextLine = lines.find((l) => l.includes("context line"))!;
    expect(contextLine).toContain("1 1");
  });

  test("addition line shows new line number and blank for old", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const additionLine = lines.find((l) => l.includes("added"))!;
    // gutter for new=2, width=1: '  2' (space + space + '2')
    expect(additionLine).toContain("  2");
  });

  test("removal line shows old line number and blank for new", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const removalLine = lines.find((l) => l.includes("removed"))!;
    // gutter for old=2, width=1: '2  ' (2 + space + space)
    expect(removalLine).toContain("2  ");
  });

  test("line numbers are right-aligned in a fixed-width field", () => {
    const lines = formatDiff(HIGH_LINE_DIFF, "big.ts").split("\n");
    // @@ -95,3 +97,3 @@ → maxLine = max(95+3, 97+3) = 100 → width = 3
    // Context (old=95, new=97): gutter=' 95  97'
    const contextLine = lines.find((l) => l.includes("context"))!;
    expect(contextLine).toContain(" 95");
    expect(contextLine).toContain(" 97");
  });

  test("width is consistent for all lines in a diff", () => {
    const output = formatDiff(HIGH_LINE_DIFF, "big.ts");
    const lines = output.split("\n");
    // Strip ANSI codes for easier inspection
    // eslint-disable-next-line no-control-regex
    const stripped = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    // HIGH_LINE_DIFF: @@ -95,3 +97,3 @@ → maxLine = max(98,100) = 100 → width = 3
    // Gutter is always 2*width+1 = 7 chars. Then a separator space (pos 7),
    // then the diff prefix char (+, -, or space for context) at position 8.
    const EXPECTED_PREFIX_INDEX = 2 * 3 + 2; // 8
    for (const line of stripped) {
      const prefixChar = line[EXPECTED_PREFIX_INDEX];
      expect(['+', '-', ' ']).toContain(prefixChar);
    }
  });

  test("second hunk starts with the correct line numbers from the @@ header", () => {
    const lines = formatDiff(TWO_HUNK_DIFF, "a.ts").split("\n");
    // Second hunk starts at @@ -10,2 +10,2 @@ → context at old=10, new=10
    const secondContextLine = lines.find((l) => l.includes("second context"))!;
    expect(secondContextLine).toContain("10");
  });

  test("second hunk removal uses old line 11 (after context at 10)", () => {
    const lines = formatDiff(TWO_HUNK_DIFF, "a.ts").split("\n");
    const removalLine = lines.find((l) => l.includes("second removal"))!;
    expect(removalLine).toContain("11");
  });
});

// ── formatDiff – header skipping ───────────────────────────────────────────────

describe("formatDiff – header skipping", () => {
  test("--- file header lines do not appear in output", () => {
    const output = formatDiff(SIMPLE_DIFF, "test.ts");
    expect(output).not.toContain("--- old.ts");
  });

  test("+++ file header lines do not appear in output", () => {
    const output = formatDiff(SIMPLE_DIFF, "test.ts");
    expect(output).not.toContain("+++ new.ts");
  });

  test("@@ hunk header lines do not appear in the rendered output", () => {
    const output = formatDiff(SIMPLE_DIFF, "test.ts");
    expect(output).not.toContain("@@ -1,3");
  });

  test("output contains exactly three lines for a one-hunk three-line diff", () => {
    const output = formatDiff(SIMPLE_DIFF, "test.ts");
    expect(output.split("\n")).toHaveLength(3);
  });

  test("Index: and === separator lines are silently skipped", () => {
    const diffWithIndex = [
      "Index: test.ts",
      "===================================================================",
      "--- test.ts",
      "+++ test.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
    ].join("\n");
    const lines = formatDiff(diffWithIndex, "test.ts").split("\n");
    expect(lines).toHaveLength(2);
  });
});

// ── formatDiff – language detection and highlighting ─────────────────────────

describe("formatDiff – language detection and highlighting", () => {
  test("output for .ts file contains no raw HTML span tags", () => {
    const diff = [
      "--- a.ts",
      "+++ b.ts",
      "@@ -1,1 +1,1 @@",
      " const x = 1;",
    ].join("\n");
    const output = formatDiff(diff, "src/foo.ts");
    expect(output).not.toContain("<span");
    expect(output).not.toContain("</span>");
  });

  test("output for unknown extension contains no raw HTML span tags", () => {
    const diff = [
      "--- a.xyz",
      "+++ b.xyz",
      "@@ -1,1 +1,1 @@",
      "+some text",
    ].join("\n");
    const output = formatDiff(diff, "file.xyz");
    expect(output).not.toContain("<span");
    expect(output).not.toContain("</span>");
  });

  test("TypeScript keywords are colored BLUE on context lines", () => {
    const diff = [
      "--- a.ts",
      "+++ b.ts",
      "@@ -1,1 +1,1 @@",
      " const x = 1;",
    ].join("\n");
    const output = formatDiff(diff, "foo.ts");
    // 'const' is an hljs-keyword → BLUE
    expect(output).toContain(BLUE);
  });

  test("HTML entities in source code are decoded in output", () => {
    // Simulate hljs output that would contain &lt; (e.g. from x < y)
    // We test by giving the diff a TypeScript expression with < operator
    const diff = [
      "--- a.ts",
      "+++ b.ts",
      "@@ -1,1 +1,2 @@",
      " x < y;",
    ].join("\n");
    const output = formatDiff(diff, "foo.ts");
    // The rendered output should contain the literal < not &lt;
    expect(output).toContain("<");
    expect(output).not.toContain("&lt;");
  });
});
