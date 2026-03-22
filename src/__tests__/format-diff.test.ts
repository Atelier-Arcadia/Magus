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
import {
  GREEN, RED, BLUE, GREY, YELLOW, CYAN, PURPLE, RESET,
  RESET_FG, RESET_DIM, DIM, LIGHT_BLUE, LIGHT_GREY,
  BG_DIFF_ADD, BG_DIFF_REMOVE,
} from "../ansi";

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
  // With empty baseline, </span> emits RESET_FG (reset foreground only)
  const R = RESET_FG; // shorthand for empty-baseline restore

  test("converts hljs-keyword span to BLUE", () => {
    const html = '<span class="hljs-keyword">const</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${BLUE}const${R}`);
  });

  test("converts hljs-comment span to GREY", () => {
    const html = '<span class="hljs-comment">// note</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${GREY}// note${R}`);
  });

  test("converts hljs-number span to YELLOW", () => {
    const html = '<span class="hljs-number">42</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${YELLOW}42${R}`);
  });

  test("converts hljs-title span to CYAN", () => {
    const html = '<span class="hljs-title">myFn</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${CYAN}myFn${R}`);
  });

  test("converts hljs-built_in span to CYAN", () => {
    const html = '<span class="hljs-built_in">console</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${CYAN}console${R}`);
  });

  test("converts hljs-literal span to YELLOW", () => {
    const html = '<span class="hljs-literal">true</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${YELLOW}true${R}`);
  });

  test("converts hljs-type span to PURPLE", () => {
    const html = '<span class="hljs-type">string</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${PURPLE}string${R}`);
  });

  test("hljs-string always uses GREEN regardless of baseline", () => {
    const html = '<span class="hljs-string">\'hello\'</span>';
    // On context line (empty baseline)
    expect(htmlToAnsi(html, "")).toBe(`${GREEN}'hello'${R}`);
    // On addition line (bg baseline) — string still GREEN, not overridden
    const bg = BG_DIFF_ADD;
    if (bg) {
      expect(htmlToAnsi(html, bg)).toBe(`${GREEN}'hello'${R}${bg}`);
    }
  });

  test("restores baseline after each span close", () => {
    const bg = BG_DIFF_ADD;
    if (bg) {
      const html = '<span class="hljs-keyword">const</span> x';
      const result = htmlToAnsi(html, bg);
      expect(result).toBe(`${BLUE}const${RESET_FG}${bg} x`);
    }
  });

  test("unknown hljs class uses no color override", () => {
    const html = '<span class="hljs-unknown">foo</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`foo${R}`);
  });

  test("converts hljs-property span to LIGHT_BLUE", () => {
    const html = '<span class="hljs-property">name</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${LIGHT_BLUE}name${R}`);
  });

  test("converts hljs-attr span to LIGHT_BLUE", () => {
    const html = '<span class="hljs-attr">class</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${LIGHT_BLUE}class${R}`);
  });

  test("converts hljs-params span to LIGHT_GREY", () => {
    const html = '<span class="hljs-params">x, y</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${LIGHT_GREY}x, y${R}`);
  });

  test("handles compound hljs class (e.g. hljs-title function_)", () => {
    const html = '<span class="hljs-title function_">myFunc</span>';
    const result = htmlToAnsi(html, "");
    // Should match 'hljs-title function_' first (exact), or fall back to 'hljs-title'
    expect(result).toBe(`${CYAN}myFunc${R}`);
  });

  test("decodes HTML entities inside span content", () => {
    const html = '<span class="hljs-number">1 &lt; 2</span>';
    const result = htmlToAnsi(html, "");
    expect(result).toBe(`${YELLOW}1 < 2${R}`);
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
    expect(result).toContain("const");
    expect(result).not.toContain("<script");
  });

  test("uses highlightAuto when language is null", () => {
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
  const hasBgColors = !!BG_DIFF_ADD;

  test("addition lines end with RESET", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const additionLine = lines.find((l) => l.includes("+") && l.includes("added"))!;
    expect(additionLine.endsWith(RESET)).toBe(true);
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

  if (hasBgColors) {
    test("addition lines use background color, not foreground green", () => {
      const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
      const additionLine = lines.find((l) => l.includes("+") && l.includes("added"))!;
      expect(additionLine).toContain(BG_DIFF_ADD);
    });

    test("removal lines use background color, not foreground red", () => {
      const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
      const removalLine = lines.find((l) => l.includes("-") && l.includes("removed"))!;
      expect(removalLine).toContain(BG_DIFF_REMOVE);
    });
  }
});

// ── formatDiff – gutter ─────────────────────────────────────────────────────

describe("formatDiff – gutter", () => {
  test("gutter contains box-drawing separator", () => {
    const output = formatDiff(SIMPLE_DIFF, "test.ts");
    expect(output).toContain("\u2502");
  });

  test("context line gutter is dimmed", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const contextLine = lines.find((l) => l.includes("context line"))!;
    expect(contextLine).toContain(DIM);
    expect(contextLine).toContain(RESET_DIM);
  });
});

// ── formatDiff – line numbers ──────────────────────────────────────────────────

describe("formatDiff – line numbers", () => {
  test("context line shows old and new line numbers", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const contextLine = lines.find((l) => l.includes("context line"))!;
    expect(contextLine).toContain("1");
  });

  test("addition line shows new line number", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const additionLine = lines.find((l) => l.includes("added"))!;
    expect(additionLine).toContain("2");
  });

  test("removal line shows old line number", () => {
    const lines = formatDiff(SIMPLE_DIFF, "test.ts").split("\n");
    const removalLine = lines.find((l) => l.includes("removed"))!;
    expect(removalLine).toContain("2");
  });

  test("line numbers are right-aligned in a fixed-width field", () => {
    const lines = formatDiff(HIGH_LINE_DIFF, "big.ts").split("\n");
    const contextLine = lines.find((l) => l.includes("context"))!;
    expect(contextLine).toContain(" 95");
    expect(contextLine).toContain(" 97");
  });

  test("second hunk starts with the correct line numbers from the @@ header", () => {
    const lines = formatDiff(TWO_HUNK_DIFF, "a.ts").split("\n");
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
    expect(output).toContain(BLUE);
  });

  test("HTML entities in source code are decoded in output", () => {
    const diff = [
      "--- a.ts",
      "+++ b.ts",
      "@@ -1,1 +1,2 @@",
      " x < y;",
    ].join("\n");
    const output = formatDiff(diff, "foo.ts");
    expect(output).toContain("<");
    expect(output).not.toContain("&lt;");
  });

  test("syntax highlighting is preserved on addition lines (not just green)", () => {
    const diff = [
      "--- a.ts",
      "+++ b.ts",
      "@@ -1,1 +1,2 @@",
      "+const x = 1;",
    ].join("\n");
    const output = formatDiff(diff, "foo.ts");
    // Keywords should still be BLUE even on addition lines
    expect(output).toContain(BLUE);
  });
});
