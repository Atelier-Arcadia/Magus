# Plan Rejection Exit on No Input

## Summary

Added program termination behaviour when the user enters any variation of 'n', 'N', 'no', 'No', or 'NO' at the orchestrator's plan approval prompt. Previously, these inputs were treated as feedback and sent back to the planner. Now they cleanly exit the process with code 0.

## Key Decisions

- **Exit via injected dependency**: The `exit` callback was added to the existing `DrainEventsDeps` type rather than calling `process.exit` directly. This follows the established dependency-injection pattern in `code-helpers.ts` and keeps the function testable.
- **Case-insensitive matching**: The user's answer is normalized with `.trim().toLowerCase()` before comparing against `'n'` and `'no'`.
- **Three-way branching**: The approval prompt now has three distinct outcomes: approve (`y`/`yes`), reject and exit (`n`/`no`), or provide feedback (anything else). This means typing 'no, please add a test step' is treated as feedback, not a rejection — only bare `n`/`no` triggers exit.
- **Early return after exit**: After calling `deps.exit(0)`, the function returns immediately and does **not** call `event.resolve()`, preventing the orchestrator from continuing.

## Implementation Details

- **Modified file**: `src/code-helpers.ts` — added `exit` field to `DrainEventsDeps` type and the `n`/`no` branch in the `plan_approval_request` handler.
- **Default wiring**: `defaultDrainEventsDeps` maps `exit` to `process.exit`.
- **Production wiring**: `code.ts` passes no explicit deps, relying on the default.
- **Test file**: `src/__tests__/drain-events.test.ts` — added 6 new tests covering all case variations (`n`, `no`, `N`, `No`, `NO`) plus a test verifying a cancellation message is logged before exit.
- **Test pattern**: Tests inject a mock `exit` function and assert both that it was called with `0` and that `resolve` was **not** called.

## Outcome

Implementation succeeded. All new tests pass. The change is minimal and non-breaking — existing feedback behaviour for arbitrary strings is preserved, and auto-approve mode is unaffected.
