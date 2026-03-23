process.env.FORCE_COLOR = '1';
import { describe, expect, test } from "bun:test";
import {
  stylizeMarkdown,
  RESET, BOLD, ITALIC, DIM,
  RED, PURPLE, GREEN, BLUE,
  LIGHT_GREY, GREY, LIGHT_BLUE,
} from "../ui/stylize-markdown";

// ── Plain text passthrough ──────────────────────────────────────────────────

describe("plain text passthrough", () => {
  test("plain text with no markdown passes through unchanged", () => {
    expect(stylizeMarkdown("hello world")).toBe("hello world");
  });

  test("empty string passes through unchanged", () => {
    expect(stylizeMarkdown("")).toBe("");
  });

  test("multi-line plain text preserves newlines", () => {
    expect(stylizeMarkdown("line one\nline two\nline three")).toBe(
      "line one\nline two\nline three",
    );
  });
});

// ── ATX Headings ────────────────────────────────────────────────────────────

describe("ATX headings", () => {
  test("# H1 outputs bold red text without the # prefix", () => {
    expect(stylizeMarkdown("# Hello")).toBe(`${BOLD}${RED}Hello${RESET}`);
  });

  test("## H2 outputs bold purple text without the ## prefix", () => {
    expect(stylizeMarkdown("## Hello")).toBe(`${BOLD}${PURPLE}Hello${RESET}`);
  });

  test("### H3 outputs bold green text without the ### prefix", () => {
    expect(stylizeMarkdown("### Hello")).toBe(`${BOLD}${GREEN}Hello${RESET}`);
  });

  test("#### H4 outputs bold blue text without the #### prefix", () => {
    expect(stylizeMarkdown("#### Hello")).toBe(`${BOLD}${BLUE}Hello${RESET}`);
  });

  test("heading text is preserved as-is", () => {
    expect(stylizeMarkdown("# My Section Title")).toBe(
      `${BOLD}${RED}My Section Title${RESET}`,
    );
  });

  test("ATX heading in the middle of multi-line content", () => {
    const input = "intro\n## Section\noutro";
    const expected = `intro\n${BOLD}${PURPLE}Section${RESET}\noutro`;
    expect(stylizeMarkdown(input)).toBe(expected);
  });
});

// ── Setext Headings ─────────────────────────────────────────────────────────

describe("setext headings", () => {
  test("line followed by === renders as H1 (bold red), underline row removed", () => {
    expect(stylizeMarkdown("Hello\n===")).toBe(`${BOLD}${RED}Hello${RESET}`);
  });

  test("line followed by --- renders as H2 (bold purple), underline row removed", () => {
    expect(stylizeMarkdown("Hello\n---")).toBe(`${BOLD}${PURPLE}Hello${RESET}`);
  });

  test("setext H1 with longer underline string", () => {
    expect(stylizeMarkdown("Title\n=======")).toBe(`${BOLD}${RED}Title${RESET}`);
  });

  test("setext H2 with longer underline string", () => {
    expect(stylizeMarkdown("Title\n-------")).toBe(`${BOLD}${PURPLE}Title${RESET}`);
  });

  test("setext heading followed by more content", () => {
    const input = "My Heading\n===\nsome text after";
    const expected = `${BOLD}${RED}My Heading${RESET}\nsome text after`;
    expect(stylizeMarkdown(input)).toBe(expected);
  });

  test("=== at start of content without preceding text passes through unchanged", () => {
    expect(stylizeMarkdown("===")).toBe("===");
  });

  test("--- at start of content without preceding text passes through unchanged", () => {
    expect(stylizeMarkdown("---")).toBe("---");
  });
});

// ── Bold ─────────────────────────────────────────────────────────────────────

describe("bold", () => {
  test("**text** outputs bold light blue text without ** markers", () => {
    expect(stylizeMarkdown("**bold**")).toBe(`${BOLD}${LIGHT_BLUE}bold${RESET}`);
  });

  test("multiple bold spans on a single line are each styled", () => {
    const result = stylizeMarkdown("**one** and **two**");
    expect(result).toBe(
      `${BOLD}${LIGHT_BLUE}one${RESET} and ${BOLD}${LIGHT_BLUE}two${RESET}`,
    );
  });

  test("text outside bold markers is unchanged", () => {
    const result = stylizeMarkdown("before **mid** after");
    expect(result).toBe(`before ${BOLD}${LIGHT_BLUE}mid${RESET} after`);
  });
});

// ── Italic ───────────────────────────────────────────────────────────────────

describe("italic", () => {
  test("_text_ outputs italic light blue text without _ markers", () => {
    expect(stylizeMarkdown("_italic_")).toBe(
      `${ITALIC}${LIGHT_BLUE}italic${RESET}`,
    );
  });

  test("underscores inside a word identifier are NOT treated as italic", () => {
    expect(stylizeMarkdown("my_variable_name")).toBe("my_variable_name");
  });

  test("underscores inside a multi-segment identifier are NOT treated as italic", () => {
    expect(stylizeMarkdown("some_long_identifier_here")).toBe(
      "some_long_identifier_here",
    );
  });

  test("_italic_ at word boundary within a sentence", () => {
    const result = stylizeMarkdown("see _this_ example");
    expect(result).toBe(`see ${ITALIC}${LIGHT_BLUE}this${RESET} example`);
  });
});

// ── Inline code ──────────────────────────────────────────────────────────────

describe("inline code", () => {
  test("`code` outputs red text without backtick markers", () => {
    expect(stylizeMarkdown("`hello`")).toBe(`${RED}hello${RESET}`);
  });

  test("inline code within surrounding text", () => {
    const result = stylizeMarkdown("call `foo()` now");
    expect(result).toBe(`call ${RED}foo()${RESET} now`);
  });
});

// ── Block quotes ─────────────────────────────────────────────────────────────

describe("block quotes", () => {
  test("> quote outputs grey text with the > prefix preserved", () => {
    expect(stylizeMarkdown("> a quote")).toBe(`${GREY}> a quote${RESET}`);
  });

  test("block quote in the middle of multi-line content", () => {
    const input = "before\n> note\nafter";
    const expected = `before\n${GREY}> note${RESET}\nafter`;
    expect(stylizeMarkdown(input)).toBe(expected);
  });
});

// ── Code blocks ──────────────────────────────────────────────────────────────

describe("code blocks", () => {
  test("fence lines are dimmed, content lines are light grey", () => {
    const input = "```\ncode here\n```";
    const expected =
      `${DIM}\`\`\`${RESET}\n${LIGHT_GREY}code here${RESET}\n${DIM}\`\`\`${RESET}`;
    expect(stylizeMarkdown(input)).toBe(expected);
  });

  test("fence with language tag is dimmed", () => {
    const input = "```ts\nconst x = 1;\n```";
    const expected =
      `${DIM}\`\`\`ts${RESET}\n${LIGHT_GREY}const x = 1;${RESET}\n${DIM}\`\`\`${RESET}`;
    expect(stylizeMarkdown(input)).toBe(expected);
  });

  test("inline markdown inside code block is NOT processed", () => {
    const input = "```\n**bold** and _italic_\n```";
    const expected =
      `${DIM}\`\`\`${RESET}\n${LIGHT_GREY}**bold** and _italic_${RESET}\n${DIM}\`\`\`${RESET}`;
    expect(stylizeMarkdown(input)).toBe(expected);
  });

  test("content after a closed code block is processed normally", () => {
    const input = "```\ncode\n```\n**bold**";
    const result = stylizeMarkdown(input);
    expect(result).toContain(`${BOLD}${LIGHT_BLUE}bold${RESET}`);
    expect(result).toContain(`${LIGHT_GREY}code${RESET}`);
  });
});

// ── Links ────────────────────────────────────────────────────────────────────

describe("links", () => {
  test("[text](url) renders as 'text (url)' with url in light blue", () => {
    const result = stylizeMarkdown("[Click here](https://example.com)");
    expect(result).toBe(`Click here (${LIGHT_BLUE}https://example.com${RESET})`);
  });

  test("link text is preserved and url is styled", () => {
    const result = stylizeMarkdown("see [docs](https://docs.example.com) for more");
    expect(result).toBe(
      `see docs (${LIGHT_BLUE}https://docs.example.com${RESET}) for more`,
    );
  });
});

// ── Mixed inline content ─────────────────────────────────────────────────────

describe("mixed inline content", () => {
  test("bold and inline code on the same line are both styled", () => {
    const result = stylizeMarkdown("some **bold** and `code`");
    expect(result).toBe(
      `some ${BOLD}${LIGHT_BLUE}bold${RESET} and ${RED}code${RESET}`,
    );
  });

  test("italic and link on the same line are both styled", () => {
    const result = stylizeMarkdown("_note_ see [here](http://x.com)");
    expect(result).toBe(
      `${ITALIC}${LIGHT_BLUE}note${RESET} see here (${LIGHT_BLUE}http://x.com${RESET})`,
    );
  });

  test("bold, italic and inline code on the same line", () => {
    const result = stylizeMarkdown("**a** _b_ `c`");
    expect(result).toBe(
      `${BOLD}${LIGHT_BLUE}a${RESET} ${ITALIC}${LIGHT_BLUE}b${RESET} ${RED}c${RESET}`,
    );
  });
});
