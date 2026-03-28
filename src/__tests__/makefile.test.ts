import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { mkdir, writeFile, rm } from "fs/promises";

// ── Shared exec mock state ────────────────────────────────────────────────────

/** When non-null, execImpl resolves with this value. */
let execResult: { stdout: string; stderr: string } | null = null;

/** When non-null, execImpl rejects with an enriched Error. */
let execError: { message: string; stdout: string; stderr: string } | null = null;

/** Records the command string passed to exec. */
let lastExecCommand: string | null = null;

/** Records the cwd option passed to exec. */
let lastExecCwd: string | null = null;

// ── Module mock: child_process ───────────────────────────────────────────────
// We capture the real child_process module first (before mock.module is registered)
// so we can spread all its exports into the mock. This prevents transitive SDK
// imports of execFile, spawn, etc. from breaking.
// We mount promisify.custom on exec so promisify(exec) returns execImpl directly.

const realChildProcess = await import("child_process");

const execImpl = async (cmd: string, opts: { cwd?: string }) => {
  lastExecCommand = cmd;
  lastExecCwd = opts.cwd ?? null;
  if (execError) {
    throw Object.assign(new Error(execError.message), {
      stdout: execError.stdout,
      stderr: execError.stderr,
    });
  }
  return execResult ?? { stdout: "", stderr: "" };
};

mock.module("child_process", () => ({
  ...realChildProcess,
  exec: Object.assign(
    (_cmd: string, _opts: unknown, _cb: unknown) => {},
    { [promisify.custom]: execImpl },
  ),
}));

afterAll(() => {
  mock.restore();
});

// ── Import after mocking ──────────────────────────────────────────────────────

const { makefileTool } = await import("../tools/makefile");

// ── Temp directory helpers ────────────────────────────────────────────────────
// Real filesystem is used for Makefile existence checks to avoid polluting
// the fs/promises module mock (which would break transitive SDK imports).

const createdDirs: string[] = [];

async function tempDirWithMakefile(): Promise<string> {
  const dir = join(
    tmpdir(),
    `makefile-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "Makefile"), "# test\n");
  createdDirs.push(dir);
  return dir;
}

async function tempDirWithoutMakefile(): Promise<string> {
  const dir = join(
    tmpdir(),
    `makefile-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(
    createdDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const queue = { push: mock(() => {}) };

function makeTool() {
  return makefileTool(queue as any);
}

beforeEach(() => {
  execResult = null;
  execError = null;
  lastExecCommand = null;
  lastExecCwd = null;
  queue.push.mockClear();
});

// ── missing Makefile ──────────────────────────────────────────────────────────

describe("makefileTool – missing Makefile", () => {
  test("returns isError when Makefile does not exist at cwd", async () => {
    const cwd = await tempDirWithoutMakefile();
    const result = await makeTool().handler({ target: "build", cwd }, {});
    expect(result.isError).toBe(true);
  });

  test("error text mentions 'Makefile'", async () => {
    const cwd = await tempDirWithoutMakefile();
    const result = await makeTool().handler({ target: "build", cwd }, {});
    expect(result.content[0]!.text).toContain("Makefile");
  });

  test("error text contains the resolved cwd path", async () => {
    const cwd = await tempDirWithoutMakefile();
    const result = await makeTool().handler({ target: "build", cwd }, {});
    expect(result.content[0]!.text).toContain(cwd);
  });

  test("does not call exec when Makefile is missing", async () => {
    const cwd = await tempDirWithoutMakefile();
    await makeTool().handler({ target: "build", cwd }, {});
    expect(lastExecCommand).toBeNull();
  });
});

// ── successful run ────────────────────────────────────────────────────────────

describe("makefileTool – successful run", () => {
  test("returns combined stdout and stderr on success", async () => {
    const cwd = await tempDirWithMakefile();
    execResult = { stdout: "Build complete", stderr: "Warning: deprecated" };
    const result = await makeTool().handler({ target: "build", cwd }, {});
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("Build complete");
    expect(result.content[0]!.text).toContain("Warning: deprecated");
  });

  test("returns only stdout when stderr is empty", async () => {
    const cwd = await tempDirWithMakefile();
    execResult = { stdout: "All tests pass", stderr: "" };
    const result = await makeTool().handler({ target: "test", cwd }, {});
    expect(result.content[0]!.text).toBe("All tests pass");
  });

  test("returns (no output) when both stdout and stderr are empty", async () => {
    const cwd = await tempDirWithMakefile();
    execResult = { stdout: "", stderr: "" };
    const result = await makeTool().handler({ target: "clean", cwd }, {});
    expect(result.content[0]!.text).toBe("(no output)");
  });

  test("runs make with the correct target", async () => {
    const cwd = await tempDirWithMakefile();
    execResult = { stdout: "ok", stderr: "" };
    await makeTool().handler({ target: "lint", cwd }, {});
    expect(lastExecCommand).toBe("make lint");
  });
});

// ── failed run ───────────────────────────────────────────────────────────────

describe("makefileTool – failed run", () => {
  test("returns isError when exec rejects", async () => {
    const cwd = await tempDirWithMakefile();
    execError = { message: "make: *** [build] Error 1", stdout: "partial", stderr: "error text" };
    const result = await makeTool().handler({ target: "build", cwd }, {});
    expect(result.isError).toBe(true);
  });

  test("includes the error message in the failure response", async () => {
    const cwd = await tempDirWithMakefile();
    execError = { message: "make: *** [build] Error 1", stdout: "", stderr: "" };
    const result = await makeTool().handler({ target: "build", cwd }, {});
    expect(result.content[0]!.text).toContain("make: *** [build] Error 1");
  });

  test("includes stderr in the failure response", async () => {
    const cwd = await tempDirWithMakefile();
    execError = { message: "failed", stdout: "", stderr: "Missing dependency" };
    const result = await makeTool().handler({ target: "build", cwd }, {});
    expect(result.content[0]!.text).toContain("Missing dependency");
  });

  test("includes stdout in the failure response", async () => {
    const cwd = await tempDirWithMakefile();
    execError = { message: "failed", stdout: "partial output", stderr: "" };
    const result = await makeTool().handler({ target: "build", cwd }, {});
    expect(result.content[0]!.text).toContain("partial output");
  });
});

// ── args escaping ─────────────────────────────────────────────────────────────

describe("makefileTool – args escaping", () => {
  test("appends shell-escaped args after the target", async () => {
    const cwd = await tempDirWithMakefile();
    execResult = { stdout: "", stderr: "" };
    await makeTool().handler({ target: "build", args: ["--flag", "value"], cwd }, {});
    expect(lastExecCommand).toBe("make build --flag value");
  });

  test("wraps args containing spaces in single quotes", async () => {
    const cwd = await tempDirWithMakefile();
    execResult = { stdout: "", stderr: "" };
    await makeTool().handler({ target: "build", args: ["value with spaces"], cwd }, {});
    expect(lastExecCommand).toBe("make build 'value with spaces'");
  });

  test("escapes single quotes inside args", async () => {
    const cwd = await tempDirWithMakefile();
    execResult = { stdout: "", stderr: "" };
    await makeTool().handler({ target: "build", args: ["it's tricky"], cwd }, {});
    expect(lastExecCommand).toBe("make build 'it'\\''s tricky'");
  });

  test("does not append anything when args array is empty", async () => {
    const cwd = await tempDirWithMakefile();
    execResult = { stdout: "", stderr: "" };
    await makeTool().handler({ target: "build", args: [], cwd }, {});
    expect(lastExecCommand).toBe("make build");
  });

  test("does not append anything when args is undefined", async () => {
    const cwd = await tempDirWithMakefile();
    execResult = { stdout: "", stderr: "" };
    await makeTool().handler({ target: "deploy", cwd }, {});
    expect(lastExecCommand).toBe("make deploy");
  });
});

// ── custom cwd ───────────────────────────────────────────────────────────────

describe("makefileTool – custom cwd", () => {
  test("passes the provided cwd option to exec", async () => {
    const cwd = await tempDirWithMakefile();
    execResult = { stdout: "", stderr: "" };
    await makeTool().handler({ target: "build", cwd }, {});
    expect(lastExecCwd).toBe(cwd);
  });

  test("exec is not called when Makefile is absent from the custom cwd", async () => {
    const cwd = await tempDirWithoutMakefile();
    await makeTool().handler({ target: "build", cwd }, {});
    expect(lastExecCommand).toBeNull();
  });

  test("error mentions the custom cwd when Makefile is missing there", async () => {
    const cwd = await tempDirWithoutMakefile();
    const result = await makeTool().handler({ target: "build", cwd }, {});
    expect(result.content[0]!.text).toContain(cwd);
  });
});

// ── queue event ──────────────────────────────────────────────────────────────

describe("makefileTool – queue event", () => {
  test("pushes a { kind: 'makefile' } event with the target name", async () => {
    const cwd = await tempDirWithMakefile();
    execResult = { stdout: "", stderr: "" };
    await makeTool().handler({ target: "deploy", cwd }, {});
    expect(queue.push).toHaveBeenCalledWith({
      kind: "makefile",
      message: 'running target "deploy"',
    });
  });

  test("pushes the event even when the Makefile is missing", async () => {
    const cwd = await tempDirWithoutMakefile();
    await makeTool().handler({ target: "build", cwd }, {});
    expect(queue.push).toHaveBeenCalledWith({
      kind: "makefile",
      message: 'running target "build"',
    });
  });

  test("pushes exactly one event per invocation", async () => {
    const cwd = await tempDirWithMakefile();
    execResult = { stdout: "", stderr: "" };
    await makeTool().handler({ target: "test", cwd }, {});
    expect(queue.push).toHaveBeenCalledTimes(1);
  });
});

