# Move UI Modules to src/ui Directory

## Summary

Relocated five UI-related source files (`ansi.ts`, `format-diff.ts`, `format-entry.ts`, `format-tool-call.ts`, `stylize-markdown.ts`) from `src/` into a new `src/ui/` directory to improve project organization. All internal (intra-group) imports among the moved files and all external consumer imports across the codebase (source files and tests) were updated to reflect the new paths.

## Key Decisions

- **Dedicated `src/ui/` directory**: Grouped all presentation/formatting concerns under a single directory rather than leaving them scattered at the top level of `src/`.
- **Two-stage approach**: Files were moved first with internal imports fixed, then external consumers were updated in a second pass. This kept the refactor manageable.
- **No barrel/index file**: The modules are imported directly by path (`./ui/format-entry`) rather than through a barrel re-export, keeping the existing import style consistent.

## Implementation Details

- **Moved files**: `src/ansi.ts`, `src/format-diff.ts`, `src/format-entry.ts`, `src/format-tool-call.ts`, `src/stylize-markdown.ts` → `src/ui/`.
- **Pre-existing files in `src/ui/`**: `types.ts` and `mapEvent.ts` were already located there.
- **Internal imports**: The moved files reference each other via `./` relative paths (e.g., `from './ansi'`), which remained correct after co-locating them.
- **External consumers updated**:
  - `src/assistant.ts` → `./ui/format-tool-call`
  - `src/code.ts` → `./ui/format-entry`, `./ui/ansi`
  - `src/tools/edit.ts` → `../ui/format-diff`
  - All test files under `src/__tests__/` → `../ui/...`

## Outcome

The refactor completed successfully. All five files are in `src/ui/`, no stale imports remain at the old paths, and both intra-group and external imports resolve correctly.
