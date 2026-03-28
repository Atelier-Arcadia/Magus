# TTY-Gated ANSI Module Centralization

## Summary

Created a centralized `src/ansi.ts` module that exports all ANSI escape constants used across the codebase, gated on TTY detection. When stdout is not a TTY (and `FORCE_COLOR` is not set), all constants resolve to empty strings, producing clean plain-text output when piped. Migrated `stylize-markdown.ts`, `format-entry.ts`, and `code.ts` to import from this central module instead of defining ANSI codes inline.

## Key Decisions

- **Detection priority**: `FORCE_COLOR` > `NO_COLOR` > `process.stdout.isTTY`. This follows the de facto standard used by chalk and other Node.js color libraries.
- **Pure functions for testability**: `detectColor()` and `buildCodes()` are exported as pure functions that accept their inputs as arguments, making them easy to unit-test without mutating process state.
- **Module-level singletons**: The detection runs once at module load and the resulting constants are exported as top-level bindings. This means color detection is evaluated once per process, not per-call.
- **Re-exports in stylize-markdown.ts**: The constants are re-exported from `stylize-markdown.ts` to maintain backward compatibility for any downstream importers during the transition period.
- **Test setup with FORCE_COLOR**: Test files set `process.env.FORCE_COLOR = "1"` at the top (and a shared `setup.ts` preload) to ensure ANSI codes are present in test assertions regardless of CI environment TTY state.

## Implementation Details

- **New file**: `src/ansi.ts` — central module with `detectColor()`, `buildCodes()`, and 14 exported constants (RESET, BOLD, ITALIC, DIM, RED, PURPLE, GREEN, BLUE, LIGHT_GREY, GREY, LIGHT_BLUE, YELLOW, CYAN, GRAY).
- **New file**: `src/__tests__/ansi.test.ts` — comprehensive tests covering detection logic, enabled/disabled code generation, and module export shape.
- **Modified**: `src/stylize-markdown.ts` — removed inline ANSI definitions, imports and re-exports from `./ansi`.
- **Modified**: `src/format-entry.ts` — imports ANSI constants from `./ansi` directly instead of from `stylize-markdown`.
- **Modified**: `src/code.ts` — imports ANSI constants from `./ansi` directly instead of defining them inline.
- **Modified**: `src/__tests__/setup.ts` — sets `FORCE_COLOR=1` as a test preload.
- **Modified**: `src/__tests__/format-entry.test.ts` and `src/__tests__/stylize-markdown.test.ts` — added `FORCE_COLOR=1` at top of file.

## Outcome

Implementation succeeded. All three consumer files (`stylize-markdown.ts`, `format-entry.ts`, `code.ts`) now source ANSI constants from a single module with TTY gating. No inline `\x1b[` sequences remain in consumer files. The `NO_COLOR` environment variable convention is also respected, providing full compatibility with the emerging standard for disabling color output.
