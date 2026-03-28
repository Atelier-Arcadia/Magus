# Continuous Streaming Output with Ink's Static Component

## Summary

Refactored the Ink-based TUI to stream all orchestrator output continuously rather than re-rendering a fixed-size windowed view that obscured previous output. The old layout used a full-screen bordered box with a `computeVisibleItems` windowing function that only showed the tail of history entries that fit within `maxHeight`, causing output from previous orchestrator phases (planner → executor → scribe) to disappear. The new implementation uses Ink's `<Static>` component to permanently commit history entries to the terminal scroll buffer, so users can always scroll up to see everything any agent did.

## Key Decisions

- **Ink `<Static>` component**: Used to permanently flush completed history entries above the dynamic area. Entries committed to `<Static>` are written once and stay on screen; the terminal's own scroll buffer preserves them.
- **`committedCount` ref pattern**: A `useRef(0)` tracks how many entries have already been committed to `<Static>`. On every render, `history[0..committedCount]` feeds `<Static>` and `history[committedCount..]` renders dynamically. A `useEffect` advances `committedCount` after each render so newly added entries graduate to `<Static>` on the next cycle.
- **Removed full-screen bordered layout**: Dropped the `width={columns} height={rows}` `BorderBox` wrapper, the two-column side-panel layout (`PlanPanel`, `ToolCallPanel`, vertical dividers), and the `useTerminalSize` hook entirely — the new layout is a simple vertical flow.
- **Simplified `drainOrchestratorRun`**: Removed `onToolCall` and `onPlan` callback parameters. The function now takes exactly four arguments: `gen`, `nextId`, `onEntries`, and `onApproval`. Tool calls and plan info already appear as inline history entries via `mapOrchestratorEvent`.
- **Extracted `renderEntry` to a shared module**: Moved per-kind rendering logic from `MessageHistory.tsx` into a new `src/ui/renderEntry.tsx` so both `<Static>` and the dynamic area can call the same function.
- **`MessageHistory.tsx` simplified**: Retained as a thin wrapper that maps entries through `renderEntry` for use in the dynamic area, but stripped of all windowing logic (`computeVisibleItems`, `estimateHeight`).

## Implementation Details

### New / changed files
- **`src/ui/App.tsx`** — Complete rewrite of the render section. Imports `Static` from `ink` and `renderEntry` from `./renderEntry`. Uses `committedCount` ref to split `history` into static and dynamic slices. `drainOrchestratorRun` simplified to 4-parameter signature. All panel state (`toolCalls`, `plan`) and associated callbacks removed.
- **`src/ui/renderEntry.tsx`** *(new)* — Exports `renderTextEntry` and `renderEntry`. Contains all per-kind JSX renderers extracted from the old `MessageHistory.tsx`.
- **`src/ui/MessageHistory.tsx`** — Simplified to a plain list component that delegates to `renderEntry`; windowing helpers removed.
- **`src/__tests__/renderEntry.test.tsx`** *(new)* — Full coverage of all `HistoryEntry` kinds including a key-prop uniqueness test.
- **`src/__tests__/App.test.tsx`** — Removed `computePanelWidths` describe blocks, `BorderBox` border-character tests, `onToolCall` and `onPlan` callback tests, and all references to the old multi-parameter `drainOrchestratorRun` signature.
- **`src/__tests__/MessageHistory.test.tsx`** — Removed `estimateHeight` and `computeVisibleItems` describe blocks; retained per-kind rendering tests.

### Deleted files (stage 2 cleanup)
- `src/ui/BorderBox.tsx`
- `src/ui/PlanPanel.tsx`
- `src/ui/ToolCallPanel.tsx`
- `src/ui/useTerminalSize.ts`
- `src/__tests__/BorderBox.test.tsx`
- `src/__tests__/PlanPanel.test.tsx`
- `src/__tests__/ToolCallPanel.test.tsx`

### Preserved unchanged
- `src/ui/mapEvent.ts` (`mapOrchestratorEvent`, `extractToolCall`) — untouched.
- `src/ui/types.ts` — `ToolCallEntry` and other types retained as `extractToolCall` still references them.

## Outcome

Both stages completed successfully. No test files for removed components remain. All imports of deleted modules were cleaned up from `App.tsx` before the files were removed. The `grep` search for `BorderBox`, `PlanPanel`, `ToolCallPanel`, `useTerminalSize`, and `computePanelWidths` across `src/` returns no matches, confirming a clean removal.
