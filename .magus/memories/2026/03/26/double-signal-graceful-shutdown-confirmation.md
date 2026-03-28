# Double-Signal Graceful Shutdown Confirmation

## Summary

Added a double-signal (Ctrl+C) confirmation mechanism to prevent accidental process termination. On the first SIGINT or SIGTERM, a yellow warning message ("Press Ctrl+C again to exit.") is printed instead of exiting. A second signal within a configurable timeout window (default 3 seconds) triggers the actual exit. If no second signal arrives, the state resets so the protection remains active indefinitely.

## Key Decisions

- **Dependency injection for testability**: The `installSignalHandlers` function accepts a `SignalHandlerDeps` object with `write`, `exit`, `YELLOW`, `RESET`, and optional `timeoutMs` fields rather than directly calling `process.stdout.write` / `process.exit`. This makes the handler fully unit-testable without mocking globals.
- **Auto-resetting state**: After the timeout window elapses without a second signal, the handler resets to its initial state. This means the protection is always active, not just a one-shot guard.
- **Cleanup function return**: `installSignalHandlers` returns a cleanup function that removes the handlers and clears timers, following the teardown pattern used elsewhere in the codebase.
- **Signal-agnostic handler**: A single `handleSignal` callback is registered for both SIGINT and SIGTERM, so either signal type can serve as the first or second signal interchangeably.

## Implementation Details

- **Modified files**: `src/code-helpers.ts` (new `installSignalHandlers` function and `SignalHandlerDeps` type), `src/code.ts` (wiring at startup), `src/__tests__/code.test.ts` (7 new test cases).
- **Pattern**: State machine with two states (`receivedFirst = false/true`) and a timer-based transition back to the initial state.
- **Helper function**: `scheduleReset` wraps `setTimeout` for the auto-reset timer, keeping the main handler logic clean.
- **Constant**: `DOUBLE_SIGNAL_WARNING` holds the user-facing message string, separated from color formatting.
- **Test coverage**: First SIGINT prints warning; first SIGTERM prints warning; second signal within window exits; mixed SIGINT+SIGTERM exits; color codes applied; timeout reset works; cleanup removes handlers.

## Outcome

Implementation succeeded. The feature is well-isolated behind dependency injection, thoroughly tested (7 test cases covering all state transitions), and cleanly integrated into the startup path in `code.ts`.
