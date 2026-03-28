# Move drainEvents and promptUser to code-helpers

## Summary

Moved the `drainEvents` and `promptUser` function definitions from `src/code.ts` to `src/code-helpers.ts`, keeping them exported and updating `src/code.ts` to import them. This is a straightforward refactor to reduce the size of the main entry point file.

## Key Decisions

- Both functions were added to `src/code-helpers.ts` alongside existing CLI-parsing helpers, keeping all support functions in one module.
- The import line in `src/code.ts` was extended to include `drainEvents` and `promptUser` rather than creating a separate import statement.
- No changes were needed to the test file (`src/__tests__/drain-events.test.ts`) since it already imported from `../code-helpers`.

## Implementation Details

- **Modified files:** `src/code.ts` (removed definitions, added imports), `src/code-helpers.ts` (added definitions with exports).
- `drainEvents` depends on `mapOrchestratorEvent`, `formatEntry`, ANSI constants, and `promptUser` — all imports were already present or co-located in `code-helpers.ts`.
- `promptUser` reads from `/dev/tty` via `node:fs` `createReadStream`, which was already imported in `code-helpers.ts`.

## Outcome

Implementation succeeded. All references to `drainEvents` and `promptUser` resolve correctly: `src/code.ts` imports them, `src/code-helpers.ts` defines and exports them, and the test file imports from `code-helpers`. No broken references detected.
