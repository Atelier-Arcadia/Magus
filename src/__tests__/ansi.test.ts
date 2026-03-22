import { describe, expect, test } from "bun:test";
import { detectColor, buildCodes } from "../ansi";
import * as ansi from "../ansi";

// ── Constant name registry ───────────────────────────────────────────────────

const CONSTANT_NAMES = [
  "RESET", "BOLD", "ITALIC", "DIM",
  "RED", "PURPLE", "GREEN", "BLUE",
  "LIGHT_GREY", "GREY", "LIGHT_BLUE",
  "YELLOW", "CYAN", "GRAY",
] as const;

type ConstantName = (typeof CONSTANT_NAMES)[number];

// ── detectColor ──────────────────────────────────────────────────────────────

describe("detectColor", () => {
  test("returns true when FORCE_COLOR is set", () => {
    expect(detectColor({ FORCE_COLOR: "1" })).toBe(true);
  });

  test("returns false when NO_COLOR is set", () => {
    expect(detectColor({ NO_COLOR: "1" })).toBe(false);
  });

  test("FORCE_COLOR takes priority over NO_COLOR when both are set", () => {
    expect(detectColor({ FORCE_COLOR: "1", NO_COLOR: "1" })).toBe(true);
  });

  test("returns true when isTTY is true and no override is set", () => {
    expect(detectColor({ isTTY: true })).toBe(true);
  });

  test("returns false when isTTY is false and no override is set", () => {
    expect(detectColor({ isTTY: false })).toBe(false);
  });

  test("returns false when env is empty (no isTTY, no overrides)", () => {
    expect(detectColor({})).toBe(false);
  });
});

// ── buildCodes(true) — escape sequences present ──────────────────────────────

describe("buildCodes with enabled=true (simulates FORCE_COLOR)", () => {
  const codes = buildCodes(true);

  test("all 14 constants contain ANSI escape sequences", () => {
    for (const name of CONSTANT_NAMES) {
      expect(codes[name as ConstantName]).toMatch(/^\x1b\[/);
    }
  });

  test("RESET is \\x1b[0m", () => expect(codes.RESET).toBe("\x1b[0m"));
  test("BOLD is \\x1b[1m", () => expect(codes.BOLD).toBe("\x1b[1m"));
  test("ITALIC is \\x1b[3m", () => expect(codes.ITALIC).toBe("\x1b[3m"));
  test("DIM is \\x1b[2m", () => expect(codes.DIM).toBe("\x1b[2m"));
  test("RED is \\x1b[31m", () => expect(codes.RED).toBe("\x1b[31m"));
  test("PURPLE is \\x1b[35m", () => expect(codes.PURPLE).toBe("\x1b[35m"));
  test("GREEN is \\x1b[32m", () => expect(codes.GREEN).toBe("\x1b[32m"));
  test("BLUE is \\x1b[34m", () => expect(codes.BLUE).toBe("\x1b[34m"));
  test("LIGHT_GREY is \\x1b[37m", () => expect(codes.LIGHT_GREY).toBe("\x1b[37m"));
  test("GREY is \\x1b[90m", () => expect(codes.GREY).toBe("\x1b[90m"));
  test("LIGHT_BLUE is \\x1b[94m", () => expect(codes.LIGHT_BLUE).toBe("\x1b[94m"));
  test("YELLOW is \\x1b[33m", () => expect(codes.YELLOW).toBe("\x1b[33m"));
  test("CYAN is \\x1b[36m", () => expect(codes.CYAN).toBe("\x1b[36m"));
  test("GRAY is \\x1b[90m", () => expect(codes.GRAY).toBe("\x1b[90m"));
});

// ── buildCodes(false) — all empty strings ─────────────────────────────────

describe("buildCodes with enabled=false (simulates NO_COLOR)", () => {
  const codes = buildCodes(false);

  test("all 14 constants are empty strings", () => {
    for (const name of CONSTANT_NAMES) {
      expect(codes[name as ConstantName]).toBe("");
    }
  });

  test("RESET is empty string", () => expect(codes.RESET).toBe(""));
  test("BOLD is empty string", () => expect(codes.BOLD).toBe(""));
  test("ITALIC is empty string", () => expect(codes.ITALIC).toBe(""));
  test("DIM is empty string", () => expect(codes.DIM).toBe(""));
  test("RED is empty string", () => expect(codes.RED).toBe(""));
  test("PURPLE is empty string", () => expect(codes.PURPLE).toBe(""));
  test("GREEN is empty string", () => expect(codes.GREEN).toBe(""));
  test("BLUE is empty string", () => expect(codes.BLUE).toBe(""));
  test("LIGHT_GREY is empty string", () => expect(codes.LIGHT_GREY).toBe(""));
  test("GREY is empty string", () => expect(codes.GREY).toBe(""));
  test("LIGHT_BLUE is empty string", () => expect(codes.LIGHT_BLUE).toBe(""));
  test("YELLOW is empty string", () => expect(codes.YELLOW).toBe(""));
  test("CYAN is empty string", () => expect(codes.CYAN).toBe(""));
  test("GRAY is empty string", () => expect(codes.GRAY).toBe(""));
});

// ── Module-level exports ──────────────────────────────────────────────────────

describe("module exports", () => {
  test("exports all 14 ANSI constant names as string values", () => {
    for (const name of CONSTANT_NAMES) {
      expect(name in ansi).toBe(true);
      expect(typeof (ansi as Record<string, unknown>)[name]).toBe("string");
    }
  });

  test("exports colorEnabled as a boolean", () => {
    expect(typeof ansi.colorEnabled).toBe("boolean");
  });

  test("exports detectColor as a function", () => {
    expect(typeof ansi.detectColor).toBe("function");
  });

  test("exports buildCodes as a function", () => {
    expect(typeof ansi.buildCodes).toBe("function");
  });
});
