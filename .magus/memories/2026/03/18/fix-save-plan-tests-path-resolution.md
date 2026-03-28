# Fix: savePlan Failing Tests — Path Resolution

## Summary

Eight failing tests in `src/__tests__/save-plan.test.ts` for the `savePlan` function were investigated and resolved. All eight tests lived in the `savePlan` describe block and covered path correctness, file writing, `process.cwd()` fallback, collision-suffix handling (`-2`, `-3`), and graceful error handling. The pure-helper tests for `slugifyPrompt` and `buildPlanPath` were already passing and were not touched. The single `savePlan` test that already passed — "returns an absolute path ending in .md" — provided a useful baseline: the function was executing and returning a path, but that path did not satisfy the more specific assertions in the other eight tests.

## Key Decisions

- **Tests are the source of truth** — the implementation (`src/save-plan.ts`) was fixed; the test file was never modified.
- **`cwd` must be used verbatim** — `savePlan` uses `join(cwd, ...)` (via `buildPlanPath`) without resolving symlinks. Any `realpath`/`resolve`-style normalization of `cwd` would break `toStartWith(tempDir)` on macOS where `os.tmpdir()` returns `/tmp` (a symlink to `/private/tmp`), causing the returned path to diverge from the `tempDir` variable held by the test.
- **Collision resolution via `existsSync` loop** — `findFreePath` uses synchronous `existsSync` (imported from `"fs"`) to check for existing files, appending `-2`, `-3`, etc. as needed. This avoids any async race and is acceptable in the plan-saving context.
- **All I/O errors are swallowed** — the `try/catch` in `savePlan` returns `undefined` on any failure, satisfying the "returns undefined (does not throw) when the write fails" test (exercised by passing `/dev/null` as `cwd`, which causes `mkdir` to fail because it is a file, not a directory).

## Implementation Details

- **File**: `src/save-plan.ts`
- **Exports**: `slugifyPrompt`, `buildPlanPath`, `savePlan`
- **`slugifyPrompt(prompt)`** — lowercases, replaces non-alphanumeric runs with `-`, trims leading/trailing hyphens, truncates at a word boundary to 50 chars, falls back to `"plan"` for empty/symbol-only input.
- **`buildPlanPath(cwd, date, planName)`** — pure path builder: `join(cwd, ".magus", "plans", yyyy, mm, dd, "${planName}.md")`. Uses zero-padded month and day.
- **`findFreePath(basePath)`** — synchronous collision resolution: returns `basePath` if free; otherwise increments a counter starting at `2` and returns the first free `basePath.replace(/\.md$/, '-N.md')`.
- **`savePlan({ renderedPlan, prompt, cwd? })`** — async; defaults `cwd` to `process.cwd()`; calls `slugifyPrompt` → `buildPlanPath` → `findFreePath`; creates the directory tree with `mkdir(..., { recursive: true })`; writes the file with `writeFile`; returns the final path or `undefined` on error.
- **Imports**: `existsSync` from `"fs"` (sync); `mkdir`, `writeFile` from `"fs/promises"` (async); `dirname`, `join` from `"path"`.
- **Orchestrator tests** (`src/__tests__/orchestrator.test.ts`) were also verified as unaffected by this change.

## Outcome

**Success.** All 8 previously failing `savePlan` tests now pass. The root cause was that the `savePlan` implementation was not honoring the `cwd` argument verbatim when constructing the output path — the path returned deviated from the caller-supplied `cwd` prefix, causing `toStartWith(tempDir)` and all downstream path-equality assertions to fail. The fix ensures the path is built directly from the provided `cwd` string using `path.join` without any symlink resolution, so the returned path always starts with whatever `cwd` value the caller supplied.
