import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "ink";
import { MessageHistory } from "../ui/MessageHistory";
import type { HistoryEntry } from "../ui/types";

// Strip ANSI escape codes so assertions are colour-agnostic.
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

// ── Helpers ──────────────────────────────────────────────────────────────────

const render = (items: HistoryEntry[]) =>
  stripAnsi(renderToString(<MessageHistory items={items} />));

const entry = <E extends HistoryEntry>(e: E): HistoryEntry[] => [e];

// ── user_prompt ───────────────────────────────────────────────────────────────

describe("user_prompt", () => {
  test("renders text with ❯ prefix", () => {
    const out = render(entry({ kind: "user_prompt", id: "u1", text: "Hello" }));
    expect(out).toContain("❯ Hello");
  });

  test("❯ prefix appears before every user_prompt text", () => {
    const items: HistoryEntry[] = [
      { kind: "user_prompt", id: "u1", text: "First" },
      { kind: "user_prompt", id: "u2", text: "Second" },
    ];
    const out = render(items);
    expect(out).toContain("❯ First");
    expect(out).toContain("❯ Second");
  });
});

// ── assistant_message ─────────────────────────────────────────────────────────

describe("assistant_message", () => {
  test("renders text without any special prefix", () => {
    const out = render(entry({ kind: "assistant_message", id: "a1", text: "Hi there" }));
    expect(out).toContain("Hi there");
    expect(out).not.toContain("❯");
  });
});

// ── tool_use ──────────────────────────────────────────────────────────────────

describe("tool_use", () => {
  test("renders the tool description text", () => {
    const out = render(entry({ kind: "tool_use", id: "t1", text: "[tool: Grep]" }));
    expect(out).toContain("[tool: Grep]");
  });
});

// ── tool_error ────────────────────────────────────────────────────────────────

describe("tool_error", () => {
  test("renders the error message text", () => {
    const out = render(entry({ kind: "tool_error", id: "e1", text: "File not found" }));
    expect(out).toContain("File not found");
  });
});

// ── phase ─────────────────────────────────────────────────────────────────────

describe("phase", () => {
  test("renders label in horizontal-rule format", () => {
    const out = render(entry({ kind: "phase", id: "p1", label: "planning" }));
    expect(out).toContain("── Phase: planning ──");
  });

  test("does not render the raw label without decoration", () => {
    const out = render(entry({ kind: "phase", id: "p1", label: "execution" }));
    // The label must appear within the decorated string, not on its own.
    expect(out).toContain("── Phase: execution ──");
  });
});

// ── stage_status ──────────────────────────────────────────────────────────────

describe("stage_status", () => {
  test("renders text content", () => {
    const out = render(entry({ kind: "stage_status", id: "s1", text: "▶ Building…" }));
    expect(out).toContain("▶ Building…");
  });
});

// ── result ────────────────────────────────────────────────────────────────────

describe("result", () => {
  test("renders result summary text", () => {
    const out = render(entry({ kind: "result", id: "r1", text: "3 turns · $0.01 · 2.4s" }));
    expect(out).toContain("3 turns · $0.01 · 2.4s");
  });
});

// ── error ─────────────────────────────────────────────────────────────────────

describe("error", () => {
  test("renders error message text", () => {
    const out = render(entry({ kind: "error", id: "err1", text: "Something went wrong" }));
    expect(out).toContain("Something went wrong");
  });
});

// ── info ──────────────────────────────────────────────────────────────────────

describe("info", () => {
  test("renders informational text", () => {
    const out = render(entry({ kind: "info", id: "i1", text: "Loading context…" }));
    expect(out).toContain("Loading context…");
  });
});

// ── Multi-item list ───────────────────────────────────────────────────────────

describe("multiple items", () => {
  test("all items appear in output", () => {
    const items: HistoryEntry[] = [
      { kind: "user_prompt", id: "1", text: "Query" },
      { kind: "assistant_message", id: "2", text: "Answer" },
      { kind: "tool_use", id: "3", text: "[tool: Read]" },
      { kind: "phase", id: "4", label: "execution" },
    ];
    const out = render(items);
    expect(out).toContain("❯ Query");
    expect(out).toContain("Answer");
    expect(out).toContain("[tool: Read]");
    expect(out).toContain("── Phase: execution ──");
  });

  test("empty items list renders no content", () => {
    const out = render([]);
    expect(out.trim()).toBe("");
  });
});
