import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync } from "fs";
import { rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// ── Import under test ────────────────────────────────────────────────────────

import { slugifyPrompt, buildPlanPath, savePlan } from "../engine/save-plan";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `save-plan-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── slugifyPrompt ─────────────────────────────────────────────────────────────

describe("slugifyPrompt", () => {
  test("lowercases the input", () => {
    expect(slugifyPrompt("Hello World")).toBe("hello-world");
  });

  test("replaces spaces with hyphens", () => {
    expect(slugifyPrompt("foo bar baz")).toBe("foo-bar-baz");
  });

  test("replaces special characters with hyphens", () => {
    expect(slugifyPrompt("fix bug #123")).toBe("fix-bug-123");
  });

  test("collapses consecutive hyphens from multiple non-alphanumeric chars", () => {
    expect(slugifyPrompt("foo   bar")).toBe("foo-bar");
  });

  test("trims leading hyphens produced by leading special chars", () => {
    expect(slugifyPrompt("!hello")).toBe("hello");
  });

  test("trims trailing hyphens produced by trailing special chars", () => {
    expect(slugifyPrompt("hello!")).toBe("hello");
  });

  test("truncates to at most 50 chars", () => {
    const long = "add a new feature to the application that does something very interesting and useful";
    expect(slugifyPrompt(long).length).toBeLessThanOrEqual(50);
  });

  test("truncates at a word boundary — result does not end with a hyphen", () => {
    const long = "add a new feature to the application that does something very interesting and useful";
    expect(slugifyPrompt(long)).not.toMatch(/-$/);
  });

  test("returns 'plan' for an empty string", () => {
    expect(slugifyPrompt("")).toBe("plan");
  });

  test("returns 'plan' for a string of only special characters", () => {
    expect(slugifyPrompt("!@#$%^&*()")).toBe("plan");
  });

  test("preserves alphanumeric content faithfully", () => {
    expect(slugifyPrompt("refactor auth module")).toBe("refactor-auth-module");
  });
});

// ── buildPlanPath ─────────────────────────────────────────────────────────────

describe("buildPlanPath", () => {
  test("returns the correct full path structure", () => {
    const date = new Date(2026, 2, 17); // March 17 2026
    const result = buildPlanPath("/tmp/project", date, "my-plan");
    expect(result).toBe("/tmp/project/.magus/plans/2026/03/17/my-plan.md");
  });

  test("zero-pads single-digit month", () => {
    const date = new Date(2026, 0, 15); // January
    expect(buildPlanPath("/p", date, "x")).toContain("/01/");
  });

  test("zero-pads single-digit day", () => {
    const date = new Date(2026, 5, 5); // June 5
    expect(buildPlanPath("/p", date, "x")).toContain("/05/");
  });

  test("uses provided cwd as the root", () => {
    const date = new Date(2026, 2, 17);
    const result = buildPlanPath("/my/workspace", date, "plan");
    expect(result).toMatch(/^\/my\/workspace\//);
  });

  test("nests under .magus/plans/<yyyy>/<mm>/<dd>/", () => {
    const date = new Date(2026, 2, 17);
    const result = buildPlanPath("/root", date, "plan");
    expect(result).toContain("/.magus/plans/2026/03/17/");
  });

  test("appends <plan-name>.md as the filename", () => {
    const date = new Date(2026, 2, 17);
    const result = buildPlanPath("/root", date, "add-auth");
    expect(result).toMatch(/add-auth\.md$/);
  });
});

// ── savePlan ──────────────────────────────────────────────────────────────────

describe("savePlan", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ── creates file at expected path ─────────────────────────────────────────

  test("returns an absolute path ending in .md", async () => {
    const result = await savePlan({
      renderedPlan: "# Plan",
      prompt: "add a feature",
      cwd: tempDir,
    });
    expect(result).toBeString();
    expect(result).toMatch(/\.md$/);
  });

  test("returned path is rooted under the provided cwd", async () => {
    const result = await savePlan({
      renderedPlan: "# Plan",
      prompt: "add a feature",
      cwd: tempDir,
    });
    expect(result).toStartWith(tempDir);
  });

  test("writes renderedPlan content verbatim to the file", async () => {
    const content = "# My Plan\nStep 1\nStep 2";
    const result = await savePlan({
      renderedPlan: content,
      prompt: "add a feature",
      cwd: tempDir,
    });
    const written = await Bun.file(result!).text();
    expect(written).toBe(content);
  });

  test("path contains the slugified prompt as the filename stem", async () => {
    const result = await savePlan({
      renderedPlan: "plan",
      prompt: "refactor auth module",
      cwd: tempDir,
    });
    expect(result).toContain("refactor-auth-module");
  });

  // ── uses process.cwd() when cwd is omitted ────────────────────────────────

  test("uses process.cwd() as root when cwd is not provided", async () => {
    const spy = spyOn(process, "cwd").mockReturnValue(tempDir);
    try {
      const result = await savePlan({ renderedPlan: "plan", prompt: "test" });
      expect(result).toStartWith(tempDir);
    } finally {
      spy.mockRestore();
    }
  });

  // ── collision handling ────────────────────────────────────────────────────

  test("appends -2 suffix when the base filename already exists", async () => {
    await savePlan({ renderedPlan: "plan 1", prompt: "add a feature", cwd: tempDir });
    const second = await savePlan({ renderedPlan: "plan 2", prompt: "add a feature", cwd: tempDir });
    expect(second).toMatch(/-2\.md$/);
  });

  test("-2 and base file are distinct paths that both exist", async () => {
    const first = await savePlan({ renderedPlan: "plan 1", prompt: "add a feature", cwd: tempDir });
    const second = await savePlan({ renderedPlan: "plan 2", prompt: "add a feature", cwd: tempDir });
    expect(first).not.toBe(second);
    expect(await Bun.file(first!).text()).toBe("plan 1");
    expect(await Bun.file(second!).text()).toBe("plan 2");
  });

  test("appends -3 suffix when base and -2 already exist", async () => {
    await savePlan({ renderedPlan: "plan 1", prompt: "add a feature", cwd: tempDir });
    await savePlan({ renderedPlan: "plan 2", prompt: "add a feature", cwd: tempDir });
    const third = await savePlan({ renderedPlan: "plan 3", prompt: "add a feature", cwd: tempDir });
    expect(third).toMatch(/-3\.md$/);
  });

  // ── error handling ────────────────────────────────────────────────────────

  test("returns undefined (does not throw) when the write fails", async () => {
    // /dev/null is a file, not a directory — mkdir will fail
    const result = await savePlan({
      renderedPlan: "plan",
      prompt: "test",
      cwd: "/dev/null",
    });
    expect(result).toBeUndefined();
  });
});
