# Add `-H` / `--hide-tools` Flag to code.ts

## Summary

A new boolean CLI flag `-H` / `--hide-tools` was added to the Magus CLI (`src/code.ts`). When this flag is provided, all tool-related log entries (`tool_use` and `tool_error` kinds) are suppressed from console output, so only agent messages and other non-tool events are displayed. The implementation followed the established pattern already used by `--auto-approve`.

## Key Decisions

- **Exact-match string inclusion** — `parseHideTools` uses `Array.prototype.includes` (same as `parseAutoApprove`) to ensure only the exact flags `-H` and `--hide-tools` match; partial strings like `--hide-tools-all` or `-h` (lowercase) do not trigger the flag.
- **Case-sensitive short flag** — `-H` (uppercase) was chosen to avoid collision with any potential future `-h` / `--help` flag.
- **Filter inside `drainEvents`** — Tool suppression is applied inside the existing `for (const entry of entries)` loop via a `continue` guard, keeping the logic minimal and co-located with the other rendering logic.
- **`hideTools` threaded as a parameter** — Rather than using a module-level variable, `hideTools` was added as an explicit parameter to `drainEvents`, which keeps the function pure and testable.
- **Two-stage sequential plan** — `parseHideTools` was added to `src/code-helpers.ts` (stage 1) and wired into `src/code.ts` (stage 2, dependent on stage 1), ensuring no cross-file conflicts.

## Implementation Details

- **`src/code-helpers.ts`** — Added exported function `parseHideTools(args: string[]): boolean` immediately after `parseAutoApprove`, with JSDoc comment.
- **`src/__tests__/code.test.ts`** — Added `parseHideTools` to the import and a new `describe('parseHideTools', ...)` block with six tests: truthy for `--hide-tools`, truthy for `-H`, falsy for empty array, truthy alongside other flags, no partial match on `--hide-tools-all`, and case-sensitivity check (`-h` returns false).
- **`src/code.ts`** — Five changes made:
  1. `parseHideTools` added to the import from `./code-helpers`.
  2. `const hideTools = parseHideTools(args)` parsed in the Main section after `autoApprove`.
  3. `hideTools: boolean` added as a fourth parameter to `drainEvents`.
  4. `continue` guard added inside the entry loop: `if (hideTools && (entry.kind === 'tool_use' || entry.kind === 'tool_error')) continue;`
  5. `hideTools` passed as the fourth argument to the `drainEvents(...)` call.

## Outcome

Both plan stages completed successfully. All implementation matches the specified design. The code follows existing patterns in the codebase and no unintended files were modified.
