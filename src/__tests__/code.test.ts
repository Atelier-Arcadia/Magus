import { describe, expect, test } from "bun:test";
import {
  parseResumeSessionId,
  selectSessionId,
  parsePromptFlag,
  parseAutoApprove,
  readPrompt,
} from "../code-helpers";

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
