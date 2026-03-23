process.env.FORCE_COLOR = "1";

import { describe, expect, test } from "bun:test";
import { formatEntry } from "../ui/format-entry";
import { stylizeMarkdown } from "../ui/stylize-markdown";
import { RESET, BOLD, DIM, RED, YELLOW } from "../ui/ansi";

// ── user_prompt ───────────────────────────────────────────────────────────────────────────

describe("user_prompt", () => {
  test("wraps text with YELLOW prompt indicator and RESET", () => {
    const entry = { kind: "user_prompt" as const, id: "1", text: "hello" };
    expect(formatEntry(entry)).toBe(`${YELLOW}\u276F hello${RESET}`);
  });

  test("does NOT apply stylizeMarkdown — markdown syntax is preserved verbatim", () => {
    const entry = { kind: "user_prompt" as const, id: "1", text: "**bold**" };
    expect(formatEntry(entry)).toBe(`${YELLOW}\u276F **bold**${RESET}`);
  });
});

// ── assistant_message ───────────────────────────────────────────────────────

describe("assistant_message", () => {
  test("returns stylizeMarkdown(entry.text) for plain text", () => {
    const entry = { kind: "assistant_message" as const, id: "1", text: "plain text" };
    expect(formatEntry(entry)).toBe(stylizeMarkdown("plain text"));
  });

  test("processes markdown — bold syntax produces ANSI codes", () => {
    const entry = { kind: "assistant_message" as const, id: "1", text: "**bold**" };
    expect(formatEntry(entry)).toBe(stylizeMarkdown("**bold**"));
  });

  test("processes markdown — heading syntax produces ANSI codes", () => {
    const entry = { kind: "assistant_message" as const, id: "1", text: "# Hello" };
    expect(formatEntry(entry)).toBe(stylizeMarkdown("# Hello"));
  });

  test("is not wrapped in DIM", () => {
    const entry = { kind: "assistant_message" as const, id: "1", text: "text" };
    expect(formatEntry(entry)).not.toContain(DIM);
  });
});

// ── tool_use ─────────────────────────────────────────────────────────────────

describe("tool_use", () => {
  test("wraps text in DIM/RESET without applying stylizeMarkdown", () => {
    const entry = { kind: "tool_use" as const, id: "1", text: "**bold**" };
    expect(formatEntry(entry)).toBe(`${DIM}**bold**${RESET}`);
  });

  test("markdown syntax in tool_use text is preserved verbatim inside DIM", () => {
    const entry = { kind: "tool_use" as const, id: "1", text: "`code`" };
    expect(formatEntry(entry)).toBe(`${DIM}\`code\`${RESET}`);
  });
});

// ── tool_error ───────────────────────────────────────────────────────────────

describe("tool_error", () => {
  test("wraps text in RED/RESET without applying stylizeMarkdown", () => {
    const entry = { kind: "tool_error" as const, id: "1", text: "**error**" };
    expect(formatEntry(entry)).toBe(`${RED}**error**${RESET}`);
  });

  test("markdown syntax in tool_error text is preserved verbatim inside RED", () => {
    const entry = { kind: "tool_error" as const, id: "1", text: "# oops" };
    expect(formatEntry(entry)).toBe(`${RED}# oops${RESET}`);
  });
});

// ── stage_status ─────────────────────────────────────────────────────────────

describe("stage_status", () => {
  test("returns stylizeMarkdown(entry.text) for plain text", () => {
    const entry = { kind: "stage_status" as const, id: "1", text: "Running stage" };
    expect(formatEntry(entry)).toBe(stylizeMarkdown("Running stage"));
  });

  test("processes markdown — bold syntax produces ANSI codes", () => {
    const entry = { kind: "stage_status" as const, id: "1", text: "**Step 1**" };
    expect(formatEntry(entry)).toBe(stylizeMarkdown("**Step 1**"));
  });

  test("is not wrapped in DIM", () => {
    const entry = { kind: "stage_status" as const, id: "1", text: "status" };
    expect(formatEntry(entry)).not.toContain(DIM);
  });
});

// ── result ───────────────────────────────────────────────────────────────────

describe("result", () => {
  test("wraps text in DIM/RESET without applying stylizeMarkdown", () => {
    const entry = { kind: "result" as const, id: "1", text: "**result**" };
    expect(formatEntry(entry)).toBe(`${DIM}**result**${RESET}`);
  });

  test("markdown syntax in result text is preserved verbatim inside DIM", () => {
    const entry = { kind: "result" as const, id: "1", text: "`output`" };
    expect(formatEntry(entry)).toBe(`${DIM}\`output\`${RESET}`);
  });
});

// ── error ─────────────────────────────────────────────────────────────────────

describe("error", () => {
  test("wraps text in RED+BOLD/RESET without applying stylizeMarkdown", () => {
    const entry = { kind: "error" as const, id: "1", text: "**oops**" };
    expect(formatEntry(entry)).toBe(`${RED}${BOLD}**oops**${RESET}`);
  });

  test("markdown syntax in error text is preserved verbatim", () => {
    const entry = { kind: "error" as const, id: "1", text: "# crash" };
    expect(formatEntry(entry)).toBe(`${RED}${BOLD}# crash${RESET}`);
  });
});

// ── info ─────────────────────────────────────────────────────────────────────

describe("info", () => {
  test("wraps stylizeMarkdown(entry.text) in DIM/RESET for plain text", () => {
    const entry = { kind: "info" as const, id: "1", text: "plain info" };
    expect(formatEntry(entry)).toBe(`${DIM}${stylizeMarkdown("plain info")}${RESET}`);
  });

  test("applies stylizeMarkdown before the DIM wrapper for markdown text", () => {
    const entry = { kind: "info" as const, id: "1", text: "**bold info**" };
    expect(formatEntry(entry)).toBe(`${DIM}${stylizeMarkdown("**bold info**")}${RESET}`);
  });

  test("stylizeMarkdown output is inside DIM, not DIM inside stylizeMarkdown", () => {
    const entry = { kind: "info" as const, id: "1", text: "# Heading" };
    const result = formatEntry(entry);
    expect(result.startsWith(DIM)).toBe(true);
    expect(result.endsWith(RESET)).toBe(true);
  });
});

// ── phase ─────────────────────────────────────────────────────────────────────

describe("phase", () => {
  test("outputs bold separator line with phase label", () => {
    const entry = { kind: "phase" as const, id: "1", label: "Red" };
    expect(formatEntry(entry)).toBe(`${BOLD}\u2500\u2500 Phase: Red \u2500\u2500${RESET}`);
  });

  test("phase label is not processed through stylizeMarkdown", () => {
    const entry = { kind: "phase" as const, id: "1", label: "**Plan**" };
    expect(formatEntry(entry)).toBe(`${BOLD}\u2500\u2500 Phase: **Plan** \u2500\u2500${RESET}`);
  });
});
