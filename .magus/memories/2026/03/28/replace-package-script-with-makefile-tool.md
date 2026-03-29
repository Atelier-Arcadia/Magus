# Replace PackageScript Tool with Makefile Tool

## Summary

Replaced the JavaScript/TypeScript-specific `PackageScript` tool with a universal `Makefile` tool (`src/tools/makefile.ts`) that invokes `make` targets. This generalizes the controlled-execution capability across any project type. A guard was added to the `EditFile` tool to prevent coder agents from modifying Makefile files, and the coder agent was rewired to use the new tool.

## Key Decisions

- **`make` as the universal task runner** — Chosen over alternatives (e.g., `just`, `task`) because `make` is ubiquitous across Unix-like systems and requires no additional tooling.
- **Makefile edit guard lives in EditFile, not in a middleware** — The guard is a simple basename regex check at the top of the EditFile handler. This keeps it co-located with the tool it restricts and avoids indirection.
- **Regex covers Makefile naming variants** — The pattern `/^(Makefile|makefile|GNUmakefile)(\..+)?$/` handles standard names plus suffixed variants like `Makefile.build`.
- **PackageScript file emptied rather than deleted** — The `package-script.ts` file was emptied and marked as unused in MAGUS.md rather than physically removed from the repository.

## Implementation Details

### New Files
- `src/tools/makefile.ts` — Exports `makefileTool(queue)`. Accepts `target`, optional `args`, and optional `cwd`. Shell-escapes arguments, validates Makefile existence via `fs/promises.access`, runs `make <target>` via `child_process.exec`, and pushes a `{ kind: "makefile" }` event to the MessageQueue.

### Modified Files
- `src/tools/edit.ts` — Added `MAKEFILE_BASENAME_RE` regex and `isMakefilePath` predicate. Returns an `isError` response when the target path matches.
- `src/agents/coder.ts` — Replaced `packageScriptTool` import/usage with `makefileTool`.
- `MAGUS.md` — Updated tool listings and coder agent documentation.

### Patterns
- Follows the existing tool pattern: `tool()` wrapper from `@anthropic-ai/claude-agent-sdk`, zod schema for params, MessageQueue event push, structured `{ content, isError }` returns.
- Shell escaping uses the `'\''` single-quote idiom — safe arguments matching `[a-zA-Z0-9_\-./=:@]+` pass through unquoted.

## Outcome

Implementation succeeded. All three acceptance criteria are met:
1. ✅ PackageScript removed (emptied, no remaining imports)
2. ✅ Makefile tool created and wired into coder agent
3. ✅ EditFile blocks Makefile edits

Minor note: `package-script.ts` remains as an empty tombstone file rather than being fully deleted.
