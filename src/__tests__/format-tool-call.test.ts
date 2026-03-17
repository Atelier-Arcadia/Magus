import { describe, expect, test } from "bun:test";
import { formatToolCall } from "../format-tool-call";

describe("formatToolCall", () => {
  // ── Basic formatting ───────────────────────────────────────────────────────

  test("formats a single string argument", () => {
    expect(formatToolCall("Read", { file_path: "/src/index.ts" })).toBe(
      "[tool: Read file_path=/src/index.ts]",
    );
  });

  test("formats a single glob pattern argument", () => {
    expect(formatToolCall("Glob", { pattern: "**/*.ts" })).toBe(
      "[tool: Glob pattern=**/*.ts]",
    );
  });

  test("formats multiple arguments", () => {
    expect(
      formatToolCall("Grep", {
        pattern: "foo",
        path: "/src",
        output_mode: "content",
      }),
    ).toBe("[tool: Grep pattern=foo path=/src output_mode=content]");
  });

  test("formats empty object input as tool name only", () => {
    expect(formatToolCall("EditFile", {})).toBe("[tool: EditFile]");
  });

  // ── Null / undefined input ─────────────────────────────────────────────────

  test("formats null input as tool name only", () => {
    expect(formatToolCall("Read", null)).toBe("[tool: Read]");
  });

  test("formats undefined input as tool name only", () => {
    expect(formatToolCall("Read", undefined)).toBe("[tool: Read]");
  });

  // ── Value types ────────────────────────────────────────────────────────────

  test("formats number values", () => {
    expect(formatToolCall("EditFile", { line: 42 })).toBe(
      "[tool: EditFile line=42]",
    );
  });

  test("formats boolean values", () => {
    expect(formatToolCall("Grep", { multiline: true })).toBe(
      "[tool: Grep multiline=true]",
    );
  });

  test("skips null and undefined values", () => {
    expect(
      formatToolCall("Read", { file_path: "/a.ts", limit: null, offset: undefined }),
    ).toBe("[tool: Read file_path=/a.ts]");
  });

  // ── String truncation ─────────────────────────────────────────────────────

  test("truncates strings longer than 60 characters", () => {
    const long = "a".repeat(80);
    const result = formatToolCall("Read", { file_path: long });
    expect(result).toContain("file_path=" + "a".repeat(60) + "\u2026");
    expect(result).not.toContain("a".repeat(61));
  });

  // ── Array values ──────────────────────────────────────────────────────────

  test("formats array values as comma-separated list", () => {
    expect(formatToolCall("Run", { tools: ["Read", "Glob", "Grep"] })).toBe(
      "[tool: Run tools=Read,Glob,Grep]",
    );
  });

  test("truncates long array representations", () => {
    const items = Array.from({ length: 30 }, (_, i) => `item_${i}`);
    const result = formatToolCall("Run", { items });
    expect(result).toContain("\u2026");
    expect(result).not.toContain("\n");
  });

  // ── Nested object values ──────────────────────────────────────────────────

  test("formats nested objects as compact JSON", () => {
    const result = formatToolCall("Create", { config: { a: 1, b: 2 } });
    expect(result).toContain('config={"a":1,"b":2}');
  });

  test("truncates long nested object JSON", () => {
    const big: Record<string, number> = {};
    for (let i = 0; i < 30; i++) big[`key_${i}`] = i;
    const result = formatToolCall("Create", { config: big });
    expect(result).toContain("\u2026");
    expect(result).not.toContain("\n");
  });

  // ── No newlines ───────────────────────────────────────────────────────────

  test("output never contains newline characters", () => {
    const result = formatToolCall("Edit", {
      text: "line1\nline2\nline3",
      nested: { a: "x\ny" },
    });
    expect(result).not.toContain("\n");
    expect(result).not.toContain("\r");
  });
});
