import { describe, expect, test } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, readFile } from "fs/promises";
import { editFileTool } from "../tools/edit";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Write content to a uniquely-named temp file and return its absolute path. */
async function withTempFile(content: string): Promise<string> {
  const path = join(
    tmpdir(),
    `edit-test-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );
  await writeFile(path, content, "utf-8");
  return path;
}

/** Minimal MessageQueue stub – the handler only calls queue.push(). */
const queue = { push: () => {} } as any;

/** Shorthand: pull the async handler off an editFileTool instance. */
function handler() {
  return editFileTool(queue).handler;
}

// ── Trailing newline preservation ────────────────────────────────────────────

describe("editFileTool – trailing newline", () => {
  test("preserves trailing newline in files that end with \\n", async () => {
    const path = await withTempFile("line1\nline2\nline3\n");
    await handler()({ file_path: path, range: [2, 2], text: ["replaced"] }, {});
    expect(await readFile(path, "utf-8")).toBe("line1\nreplaced\nline3\n");
  });

  test("does not add trailing newline to files that do not end with \\n", async () => {
    const path = await withTempFile("line1\nline2\nline3");
    await handler()({ file_path: path, range: [2, 2], text: ["replaced"] }, {});
    expect(await readFile(path, "utf-8")).toBe("line1\nreplaced\nline3");
  });
});

// ── Correct line count in error messages ─────────────────────────────────────

describe("editFileTool – start-beyond-end error line count", () => {
  test("reports visible line count (3) not inflated count (4) for file with trailing \\n", async () => {
    // 3 visible lines; naive split("\n") would give 4 elements
    const path = await withTempFile("line1\nline2\nline3\n");
    const result = await handler()(
      { file_path: path, range: [10, 10], text: [] },
      {},
    );
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("3 lines");
    expect(text).not.toContain("4 lines");
  });
});

// ── End validation ───────────────────────────────────────────────────────────

describe("editFileTool – end validation", () => {
  test("returns error when end exceeds lines.length", async () => {
    // 3 visible lines → end = 4 is invalid (inclusive, max is 3)
    const path = await withTempFile("line1\nline2\nline3\n");
    const result = await handler()(
      { file_path: path, range: [1, 4], text: [] },
      {},
    );
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("end");
    expect(text).toContain("3 lines");
  });

  test("accepts end equal to lines.length (replace last line)", async () => {
    // 3 visible lines → end = 3 is the last valid line
    const path = await withTempFile("line1\nline2\nline3\n");
    const result = await handler()(
      { file_path: path, range: [3, 3], text: ["replaced"] },
      {},
    );
    expect(result.isError).toBeUndefined();
    expect(await readFile(path, "utf-8")).toBe(
      "line1\nline2\nreplaced\n",
    );
  });

  test("accepts append via end = start - 1 at end of file", async () => {
    // 3 visible lines → [4, 3] means insert before line 4 (append)
    const path = await withTempFile("line1\nline2\nline3\n");
    const result = await handler()(
      { file_path: path, range: [4, 3], text: ["appended"] },
      {},
    );
    expect(result.isError).toBeUndefined();
    expect(await readFile(path, "utf-8")).toBe(
      "line1\nline2\nline3\nappended\n",
    );
  });
});

// ── Success response includes updated line count ──────────────────────────────

describe("editFileTool – success response", () => {
  test("includes 'File now has N lines.' in successful response", async () => {
    // Replace line 2 of a 3-line file → still 3 lines after edit
    const path = await withTempFile("line1\nline2\nline3\n");
    const result = await handler()(
      { file_path: path, range: [2, 2], text: ["replaced"] },
      {},
    );
    expect(result.isError).toBeUndefined();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("File now has 3 lines.");
  });

  test("reports updated count after adding a line", async () => {
    // Insert before line 2 of a 3-line file → 4 lines after edit
    const path = await withTempFile("line1\nline2\nline3\n");
    const result = await handler()(
      { file_path: path, range: [2, 1], text: ["inserted"] },
      {},
    );
    expect(result.isError).toBeUndefined();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("File now has 4 lines.");
  });

  test("reports updated count after deleting a line", async () => {
    // Delete line 2 of a 3-line file → 2 lines after edit
    const path = await withTempFile("line1\nline2\nline3\n");
    const result = await handler()(
      { file_path: path, range: [2, 2], text: [] },
      {},
    );
    expect(result.isError).toBeUndefined();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("File now has 2 lines.");
  });
});

// ── Line counting correctness ─────────────────────────────────────────────────
//
// A trailing newline must NOT produce a phantom extra element in the line array,
// so operations that reference the full range still produce the right result.

describe("editFileTool – line counting correctness", () => {
  test("replacing all lines of a trailing-\\n file uses the correct line count", async () => {
    // 3 visible lines; inclusive range [1, 3] replaces all
    const path = await withTempFile("line1\nline2\nline3\n");
    const result = await handler()(
      { file_path: path, range: [1, 3], text: ["only"] },
      {},
    );
    expect(result.isError).toBeUndefined();
    expect(await readFile(path, "utf-8")).toBe("only\n");
  });

  test("replacing all lines of a non-trailing-\\n file works without gaining a newline", async () => {
    // 3 visible lines, no trailing newline
    const path = await withTempFile("line1\nline2\nline3");
    const result = await handler()(
      { file_path: path, range: [1, 3], text: ["only"] },
      {},
    );
    expect(result.isError).toBeUndefined();
    expect(await readFile(path, "utf-8")).toBe("only");
  });

  test("single-line file ending with \\n reports 1 line in error messages", async () => {
    const path = await withTempFile("single\n");
    const result = await handler()(
      { file_path: path, range: [99, 99], text: [] },
      {},
    );
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("1 lines");
    expect(text).not.toContain("2 lines");
  });
});

// ── Empty file (as created by CreateFile) ─────────────────────────────────────

describe("editFileTool – empty file", () => {
  test("replacing the single empty line of an empty file writes the new content", async () => {
    // CreateFile writes "" – that splits to [""], 1 line, no trailing newline
    const path = await withTempFile("");
    const result = await handler()(
      { file_path: path, range: [1, 1], text: ["hello"] },
      {},
    );
    expect(result.isError).toBeUndefined();
    expect(await readFile(path, "utf-8")).toBe("hello");
  });

  test("inserting into an empty file prepends before the single empty line", async () => {
    // Insert at [1, 0] → inserts before line 1, keeps the empty line after
    const path = await withTempFile("");
    const result = await handler()(
      { file_path: path, range: [1, 0], text: ["hello"] },
      {},
    );
    expect(result.isError).toBeUndefined();
    // "hello" inserted before "", joined → "hello\n" (no trailing \n added)
    expect(await readFile(path, "utf-8")).toBe("hello\n");
  });
});

// ── Off-by-one edge cases ─────────────────────────────────────────────────────

describe("editFileTool – off-by-one edge cases", () => {
  test("replaces the last line of a file ending with \\n", async () => {
    const path = await withTempFile("a\nb\nc\n");
    await handler()({ file_path: path, range: [3, 3], text: ["C"] }, {});
    expect(await readFile(path, "utf-8")).toBe("a\nb\nC\n");
  });

  test("replaces ALL lines of a trailing-\\n file in a single operation", async () => {
    const path = await withTempFile("a\nb\nc\n");
    await handler()({ file_path: path, range: [1, 3], text: ["x", "y"] }, {});
    expect(await readFile(path, "utf-8")).toBe("x\ny\n");
  });

  test("inserts before the very first line", async () => {
    const path = await withTempFile("a\nb\nc\n");
    await handler()({ file_path: path, range: [1, 0], text: ["first"] }, {});
    expect(await readFile(path, "utf-8")).toBe("first\na\nb\nc\n");
  });

  test("appends after the last line of a file ending with \\n", async () => {
    const path = await withTempFile("a\nb\nc\n");
    await handler()({ file_path: path, range: [4, 3], text: ["d"] }, {});
    expect(await readFile(path, "utf-8")).toBe("a\nb\nc\nd\n");
  });
});

// ── Basic operations ──────────────────────────────────────────────────────────

describe("editFileTool – basic operations", () => {
  test("insert: range [start, start-1] adds lines without removing any", async () => {
    const path = await withTempFile("a\nb\nc\n");
    await handler()({ file_path: path, range: [2, 1], text: ["inserted"] }, {});
    expect(await readFile(path, "utf-8")).toBe("a\ninserted\nb\nc\n");
  });

  test("delete: empty text array removes the targeted lines", async () => {
    const path = await withTempFile("a\nb\nc\n");
    await handler()({ file_path: path, range: [2, 2], text: [] }, {});
    expect(await readFile(path, "utf-8")).toBe("a\nc\n");
  });

  test("replace: substitutes the targeted lines with the new lines", async () => {
    const path = await withTempFile("a\nb\nc\n");
    await handler()({ file_path: path, range: [2, 2], text: ["B"] }, {});
    expect(await readFile(path, "utf-8")).toBe("a\nB\nc\n");
  });

  test("append: range [lineCount+1, lineCount] adds lines at the end", async () => {
    const path = await withTempFile("a\nb\nc\n");
    await handler()({ file_path: path, range: [4, 3], text: ["d"] }, {});
    expect(await readFile(path, "utf-8")).toBe("a\nb\nc\nd\n");
  });

  test("replace with multiple lines expands the file", async () => {
    const path = await withTempFile("a\nb\nc\n");
    await handler()({ file_path: path, range: [2, 2], text: ["B1", "B2", "B3"] }, {});
    expect(await readFile(path, "utf-8")).toBe("a\nB1\nB2\nB3\nc\n");
  });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe("editFileTool – error cases", () => {
  test("start < 1 returns an error", async () => {
    const path = await withTempFile("a\nb\n");
    const result = await handler()(
      { file_path: path, range: [0, 1], text: [] },
      {},
    );
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("start");
  });

  test("end < start - 1 returns an error", async () => {
    const path = await withTempFile("a\nb\n");
    const result = await handler()(
      { file_path: path, range: [3, 1], text: [] },
      {},
    );
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("end");
  });

  test("start beyond file length returns an error naming the line count", async () => {
    const path = await withTempFile("a\nb\nc\n");
    const result = await handler()(
      { file_path: path, range: [10, 10], text: [] },
      {},
    );
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("start");
    expect(text).toContain("3 lines");
  });

  test("non-existent file returns an error mentioning the path", async () => {
    const fakePath = "/tmp/this-file-definitely-does-not-exist-magus-test.txt";
    const result = await handler()(
      { file_path: fakePath, range: [1, 1], text: [] },
      {},
    );
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("could not read file");
  });
});
