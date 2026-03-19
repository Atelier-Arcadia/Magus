# Wire Ink UI to Entrypoint

## Summary

The readline-based REPL in `src/code.ts` was replaced with an Ink-rendered React UI. Three new modules were created: `src/ui/mapEvent.ts` (a pure event-to-`HistoryEntry` mapper), `src/ui/App.tsx` (the root interactive component composing `MessageHistory` and `TextInput`), and a rewritten `src/code.ts` entrypoint that mounts `<App>` via Ink's `render()`. The work also introduced comprehensive unit tests for both the mapper and the App's pure helper functions.

## Key Decisions

- **Pure mapper module (`mapEvent.ts`):** All conversion logic from `OrchestratorEvent` to `HistoryEntry[]` was extracted into a stateless, side-effect-free module. This keeps the React component thin and makes the mapping trivially testable.
- **`createIdGenerator` factory:** A closure-based incrementing ID generator (`h1`, `h2`, …) is exported and used via `useRef` in the component so the counter persists across renders without being stored in React state.
- **Pure helpers exported from `App.tsx`:** Instead of burying submit logic inside the component, `evalPromptSubmit`, `evalApprovalSubmit`, `isApprovalYes`, and `drainOrchestratorRun` were exported as standalone pure/async functions. This enables exhaustive unit testing without needing to render or simulate keystrokes.
- **`drainOrchestratorRun` async helper:** The async generator consumption loop was extracted from the component into a top-level async function, decoupling React state management from the async iteration logic.
- **`React.createElement` in `code.ts`:** The entrypoint stays `.ts` (not `.tsx`) and uses `React.createElement` rather than JSX to avoid any bundler or tsconfig complications with a non-TSX entry file.
- **`isActive` condition on `TextInput`:** During plan approval, `isRunning` is `true` (generator is paused awaiting resolution), so the TextInput's `isActive` prop uses `!isRunning || mode === "approval"` to keep input enabled in that mode.
- **`loadConfig` removed from entrypoint:** The old `code.ts` called `loadConfig` only for a `console.log`; this was dropped since all output is now managed by Ink.

## Implementation Details

- **`src/ui/mapEvent.ts`** — New file. Exports `createIdGenerator(): () => string` and `mapOrchestratorEvent(event, nextId): HistoryEntry[]`. Internally delegates to `mapAgentEvent`, `mapStageEnd`, and `mapStageAgentEvent` helpers. Imports `formatToolCall` from `../format-tool-call`.
- **`src/ui/App.tsx`** — New file. Exports `App` component plus five pure/async helpers (`isApprovalYes`, `evalPromptSubmit`, `evalApprovalSubmit`, `drainOrchestratorRun`, and the `AppProps` / result types). Uses `useState` for `history`, `input`, `mode`, `isRunning`, `hasResumed`, and `pendingApproval`; uses `useRef` for the `nextId` generator. Imports `selectSessionId` from `../code-helpers`.
- **`src/code.ts`** — Completely rewritten. Imports `React`, `ink.render`, `App`, `createOrchestrator`, and `parseResumeSessionId`. Calls `render(React.createElement(App, …), { exitOnCtrlC: true })` and chains `waitUntilExit().then(() => process.exit(0))`.
- **`src/__tests__/mapEvent.test.ts`** — New test file. Covers all 14 event kinds, ID generator isolation, purity (no mutation), and skipped-entry cases (`phase_end`, non-error `tool_result`).
- **`src/__tests__/App.test.tsx`** — New test file. Tests `isApprovalYes`, `evalPromptSubmit`, `evalApprovalSubmit`, `drainOrchestratorRun` (including the async approval pause/resume flow), and basic `App` rendering via `renderToString`.

## Outcome

All three stages completed successfully. Every planned file was created with the correct content matching the spec. The implementation correctly replaces the old readline REPL with an Ink-rendered interactive UI, wires `plan_approval_request` handling through React state, and is covered by focused unit tests that avoid the complexity of full interactive rendering.
