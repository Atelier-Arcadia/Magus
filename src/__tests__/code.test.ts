import { describe, expect, test } from "bun:test";
import {
  parseResumeSessionId,
  selectSessionId,
  parsePromptFlag,
  parseAutoApprove,
  parseHideTools,
  parseVerbose,
  parseHelp,
  readPrompt,
  installSignalHandlers,
} from "../code-helpers";
import { formatHelp } from "../ui/help";

// ── parseResumeSessionId ────────────────────────────────────────────────────

describe("parseResumeSessionId", () => {
  test("returns the session ID immediately following --resume", () => {
    expect(parseResumeSessionId(["--resume", "abc-123"])).toBe("abc-123");
  });

  test("returns undefined when --resume flag is absent", () => {
    expect(parseResumeSessionId([])).toBeUndefined();
  });

  test("returns undefined when --resume is the last argument (no value follows)", () => {
    expect(parseResumeSessionId(["--resume"])).toBeUndefined();
  });

  test("returns undefined when other flags are present but not --resume", () => {
    expect(
      parseResumeSessionId(["--verbose", "--output", "file.txt"]),
    ).toBeUndefined();
  });

  test("works when --resume appears alongside other flags", () => {
    expect(
      parseResumeSessionId(["--verbose", "--resume", "sess-999", "--other"]),
    ).toBe("sess-999");
  });
});

// ── selectSessionId ─────────────────────────────────────────────────────────

describe("selectSessionId", () => {
  test("returns resumeSessionId on the first call (hasResumed = false)", () => {
    expect(selectSessionId("session-xyz", false)).toBe("session-xyz");
  });

  test("returns undefined on subsequent calls (hasResumed = true)", () => {
    expect(selectSessionId("session-xyz", true)).toBeUndefined();
  });

  test("returns undefined when resumeSessionId is undefined regardless of hasResumed", () => {
    expect(selectSessionId(undefined, false)).toBeUndefined();
  });

  test("returns undefined when both resumeSessionId is undefined and hasResumed is true", () => {
    expect(selectSessionId(undefined, true)).toBeUndefined();
  });
});

// ── parsePromptFlag ────────────────────────────────────────────────────────

describe("parsePromptFlag", () => {
  test("returns the file path immediately following --prompt", () => {
    expect(parsePromptFlag(["--prompt", "prompt.txt"])).toBe("prompt.txt");
  });

  test("returns the file path immediately following -p", () => {
    expect(parsePromptFlag(["-p", "prompt.txt"])).toBe("prompt.txt");
  });

  test("returns undefined when neither --prompt nor -p is present", () => {
    expect(parsePromptFlag(["--verbose", "--output", "file.txt"])).toBeUndefined();
  });

  test("returns undefined when --prompt is the last argument (no value follows)", () => {
    expect(parsePromptFlag(["--prompt"])).toBeUndefined();
  });

  test("returns undefined when -p is the last argument (no value follows)", () => {
    expect(parsePromptFlag(["-p"])).toBeUndefined();
  });

  test("works when --prompt appears alongside other flags like --resume", () => {
    expect(
      parsePromptFlag(["--resume", "sess-123", "--prompt", "prompt.txt"]),
    ).toBe("prompt.txt");
  });

  test("prefers the first matching flag if both --prompt and -p appear", () => {
    expect(
      parsePromptFlag(["--prompt", "first.txt", "-p", "second.txt"]),
    ).toBe("first.txt");
    expect(
      parsePromptFlag(["-p", "first.txt", "--prompt", "second.txt"]),
    ).toBe("first.txt");
  });
});

// ── parseAutoApprove ─────────────────────────────────────────────────────────

describe("parseAutoApprove", () => {
  test("returns true when --auto-approve is present", () => {
    expect(parseAutoApprove(["--auto-approve"])).toBe(true);
  });

  test("returns false when --auto-approve is absent", () => {
    expect(parseAutoApprove([])).toBe(false);
  });

  test("returns true when --auto-approve appears alongside other flags", () => {
    expect(
      parseAutoApprove(["--verbose", "--auto-approve", "--output"]),
    ).toBe(true);
  });

  test("does not match partial string --auto-approved", () => {
    expect(parseAutoApprove(["--auto-approved"])).toBe(false);
  });

  test("does not match partial string --auto", () => {
    expect(parseAutoApprove(["--auto"])).toBe(false);
  });
});

// ── parseHideTools ──────────────────────────────────────────────────────────

describe("parseHideTools", () => {
  test("returns true when --hide-tools is present", () => {
    expect(parseHideTools(["--hide-tools"])).toBe(true);
  });

  test("returns true when -H is present", () => {
    expect(parseHideTools(["-H"])).toBe(true);
  });

  test("returns false when neither flag is present", () => {
    expect(parseHideTools([])).toBe(false);
  });

  test("returns true when flag appears alongside other flags", () => {
    expect(
      parseHideTools(["--verbose", "--hide-tools", "--output"]),
    ).toBe(true);
  });

  test("does not match partial string --hide-tools-all", () => {
    expect(parseHideTools(["--hide-tools-all"])).toBe(false);
  });

  test("does not match -h (lowercase)", () => {
    expect(parseHideTools(["-h"])).toBe(false);
  });
});

// ── parseVerbose ────────────────────────────────────────────────────────────

describe("parseVerbose", () => {
  test("returns true when --verbose is present", () => {
    expect(parseVerbose(["--verbose"])).toBe(true);
  });

  test("returns true when -v is present", () => {
    expect(parseVerbose(["-v"])).toBe(true);
  });

  test("returns false when neither flag is present", () => {
    expect(parseVerbose([])).toBe(false);
  });

  test("returns true when flag appears alongside other flags", () => {
    expect(
      parseVerbose(["--hide-tools", "--verbose", "--output"]),
    ).toBe(true);
  });

  test("does not match partial string --verbose-mode", () => {
    expect(parseVerbose(["--verbose-mode"])).toBe(false);
  });

  test("does not match -V (uppercase)", () => {
    expect(parseVerbose(["-V"])).toBe(false);
  });

  test("returns false when only unrelated flags are present", () => {
    expect(parseVerbose(["--hide-tools", "--auto-approve"])).toBe(false);
  });
});

// ── readPrompt ───────────────────────────────────────────────────────────────

describe("readPrompt", () => {
  test("returns trimmed file contents when a valid file path is given", async () => {
    const tmpPath = "/tmp/magus-test-prompt-valid.txt";
    await Bun.write(tmpPath, "  Hello, world!  ");
    expect(await readPrompt(tmpPath)).toBe("Hello, world!");
  });

  test("throws when the specified file does not exist", async () => {
    await expect(
      readPrompt("/tmp/magus-nonexistent-prompt-xyz-abc.txt"),
    ).rejects.toThrow();
  });

  test("throws when the file contains only whitespace", async () => {
    const tmpPath = "/tmp/magus-test-prompt-whitespace.txt";
    await Bun.write(tmpPath, "   \n\t  ");
    await expect(readPrompt(tmpPath)).rejects.toThrow();
  });

  test("trims leading/trailing whitespace and newlines from file contents", async () => {
    const tmpPath = "/tmp/magus-test-prompt-trim.txt";
    await Bun.write(tmpPath, "\n\n  My prompt text.\n\n");
    expect(await readPrompt(tmpPath)).toBe("My prompt text.");
  });
});

// ── parseHelp ──────────────────────────────────────────────────────────────

describe("parseHelp", () => {
  test("returns true when --help is present", () => {
    expect(parseHelp(["--help"])).toBe(true);
  });

  test("returns true when -h is present", () => {
    expect(parseHelp(["-h"])).toBe(true);
  });

  test("returns false when neither flag is present", () => {
    expect(parseHelp([])).toBe(false);
  });

  test("returns true when flag appears alongside other flags", () => {
    expect(parseHelp(["--verbose", "--help", "--auto-approve"])).toBe(true);
  });

  test("does not match partial string --helper", () => {
    expect(parseHelp(["--helper"])).toBe(false);
  });

  test("does not match -H (uppercase - that is hide-tools)", () => {
    expect(parseHelp(["-H"])).toBe(false);
  });
});

// ── formatHelp ──────────────────────────────────────────────────────────────

describe("formatHelp", () => {
  test("returns a non-empty string", () => {
    expect(typeof formatHelp()).toBe("string");
    expect(formatHelp().length).toBeGreaterThan(0);
  });

  test("contains a Usage section", () => {
    expect(formatHelp()).toContain("Usage");
  });

  test("contains a Flags section", () => {
    expect(formatHelp()).toContain("Flags");
  });

  test("contains 'magus' (the tool name)", () => {
    expect(formatHelp().toLowerCase()).toContain("magus");
  });

  test("mentions --resume flag", () => {
    expect(formatHelp()).toContain("--resume");
  });

  test("mentions --prompt / -p flag", () => {
    expect(formatHelp()).toContain("--prompt");
  });

  test("mentions --auto-approve flag", () => {
    expect(formatHelp()).toContain("--auto-approve");
  });

  test("mentions --hide-tools / -H flag", () => {
    expect(formatHelp()).toContain("--hide-tools");
  });

  test("mentions --verbose / -v flag", () => {
    expect(formatHelp()).toContain("--verbose");
  });

  test("mentions --help / -h flag", () => {
    expect(formatHelp()).toContain("--help");
  });
});

// ── installSignalHandlers ──────────────────────────────────────────────────

describe("installSignalHandlers", () => {
  test("first SIGINT prints warning message and does not call exit", () => {
    const writes: string[] = [];
    const exits: number[] = [];
    const cleanup = installSignalHandlers({
      write: (msg) => writes.push(msg),
      exit: (code) => exits.push(code),
      YELLOW: "[Y]",
      RESET: "[R]",
      timeoutMs: 5000,
    });
    try {
      process.emit("SIGINT");
      expect(writes).toHaveLength(1);
      expect(writes[0]).toContain("Press Ctrl+C again to exit");
      expect(exits).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  test("first SIGTERM prints warning message and does not call exit", () => {
    const writes: string[] = [];
    const exits: number[] = [];
    const cleanup = installSignalHandlers({
      write: (msg) => writes.push(msg),
      exit: (code) => exits.push(code),
      YELLOW: "[Y]",
      RESET: "[R]",
      timeoutMs: 5000,
    });
    try {
      process.emit("SIGTERM");
      expect(writes).toHaveLength(1);
      expect(writes[0]).toContain("Press Ctrl+C again to exit");
      expect(exits).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  test("second SIGINT within the timeout window calls exit with code 1", () => {
    const exits: number[] = [];
    const cleanup = installSignalHandlers({
      write: () => {},
      exit: (code) => exits.push(code),
      YELLOW: "",
      RESET: "",
      timeoutMs: 5000,
    });
    try {
      process.emit("SIGINT");
      process.emit("SIGINT");
      expect(exits).toEqual([1]);
    } finally {
      cleanup();
    }
  });

  test("second SIGTERM after first SIGINT within the timeout window calls exit with code 1", () => {
    const exits: number[] = [];
    const cleanup = installSignalHandlers({
      write: () => {},
      exit: (code) => exits.push(code),
      YELLOW: "",
      RESET: "",
      timeoutMs: 5000,
    });
    try {
      process.emit("SIGINT");
      process.emit("SIGTERM");
      expect(exits).toEqual([1]);
    } finally {
      cleanup();
    }
  });

  test("warning message wraps text with YELLOW and RESET color codes", () => {
    const writes: string[] = [];
    const cleanup = installSignalHandlers({
      write: (msg) => writes.push(msg),
      exit: () => {},
      YELLOW: "\x1b[33m",
      RESET: "\x1b[0m",
      timeoutMs: 5000,
    });
    try {
      process.emit("SIGINT");
      expect(writes[0]).toMatch(/^\x1b\[33m/);
      expect(writes[0]).toMatch(/\x1b\[0m$/);
    } finally {
      cleanup();
    }
  });

  test("after timeout elapses, the next signal is treated as a first signal again", async () => {
    const writes: string[] = [];
    const exits: number[] = [];
    const cleanup = installSignalHandlers({
      write: (msg) => writes.push(msg),
      exit: (code) => exits.push(code),
      YELLOW: "",
      RESET: "",
      timeoutMs: 20,
    });
    try {
      process.emit("SIGINT");
      expect(writes).toHaveLength(1);
      await new Promise((resolve) => setTimeout(resolve, 60));
      process.emit("SIGINT");
      expect(writes).toHaveLength(2);
      expect(exits).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  test("cleanup removes signal handlers so subsequent signals have no effect", () => {
    const writes: string[] = [];
    const exits: number[] = [];
    const cleanup = installSignalHandlers({
      write: (msg) => writes.push(msg),
      exit: (code) => exits.push(code),
      YELLOW: "",
      RESET: "",
      timeoutMs: 5000,
    });
    cleanup();
    process.emit("SIGINT");
    expect(writes).toHaveLength(0);
    expect(exits).toHaveLength(0);
  });
});
