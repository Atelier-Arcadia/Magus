import { describe, expect, test } from "bun:test";
import { parseResumeSessionId, selectSessionId } from "../code-helpers";

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
