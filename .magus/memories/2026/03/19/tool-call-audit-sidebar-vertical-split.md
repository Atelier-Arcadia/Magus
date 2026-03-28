# Tool-Call Audit Sidebar & Vertical Split Layout

## Summary

A tool-call auditing sidebar was added to the Magus terminal UI. The application layout was split vertically: 90% of terminal width on the left houses the existing `BorderBox`-wrapped prompt/output stream, and the remaining 10% on the right displays a fixed-height `ToolCallPanel` listing tool invocations in chronological order (most recent at the bottom). Tool-use events are no longer rendered inline in the main message history; they are routed exclusively to the sidebar, keeping the left panel cleaner.

## Key Decisions

- **Separate type, separate concern.** `ToolCallEntry` was added as a distinct exported type in `src/ui/types.ts` rather than extending `HistoryEntry`. This keeps the two display channels independent and avoids polluting the existing history pipeline.
- **`extractToolCall` as a standalone function.** Rather than modifying `mapOrchestratorEvent`, a new `extractToolCall` function was added to `src/ui/mapEvent.ts`. This preserves the existing mapping logic and avoids side-effects on history consumers. Both functions share the same `nextId` generator so IDs remain globally unique.
- **`tool_use` returns `[]` in history mappers.** `mapAgentEvent` and `mapStageAgentEvent` now return an empty array for `tool_use` events, removing them from the main output stream since the sidebar takes ownership of that information.
- **90/10 width split with a minimum sidebar width.** Panel widths are computed as `sidebarWidth = Math.max(15, Math.floor(columns * 0.1))` and `mainWidth = columns - sidebarWidth`, ensuring the sidebar is always at least 15 columns wide on narrow terminals.
- **Tail-visible overflow.** `ToolCallPanel` slices the items array to the tail (most-recent) entries that fit within the available height (`Math.floor(height / 2)` 2-line slots), so the panel stays fixed-height and always shows the latest activity.
- **`onToolCall` callback added to `drainOrchestratorRun`.** The async drain function received a fifth parameter `onToolCall: (entry: ToolCallEntry) => void`, keeping the React state update wiring at the call site in `makePromptHandler` and out of the generic drain logic.

## Implementation Details

### New files
- **`src/ui/ToolCallPanel.tsx`** — Ink component rendering the right-side audit panel. Uses `<Box height={2} flexDirection="column">` per item (tool name on line 1, dim input preview on line 2). Input preview is extracted via `extractInputPreview`, which handles `null`, strings, arrays, and objects (first value of first key). Both tool name and preview are truncated to `width - 1` with a `…` ellipsis. Tail-slicing is performed before render.
- **`src/__tests__/ToolCallPanel.test.tsx`** — Comprehensive tests covering: empty list, single tool call (name, preview, null input), multiple tool calls (order), truncation of name and preview, and overflow/tail behaviour.

### Modified files
- **`src/ui/types.ts`** — Added `ToolCallEntry` export (`id`, `tool`, `input: unknown`, `stageId?: string`, `timestamp: number`). `HistoryEntry` unchanged.
- **`src/ui/mapEvent.ts`**
  - Imported `ToolCallEntry`.
  - `mapAgentEvent` `case "tool_use"` returns `[]`.
  - `mapStageAgentEvent` `case "tool_use"` returns `[]`.
  - New exported `extractToolCall(event, nextId)` returns a `ToolCallEntry` for `agent_event`/`stage_agent_event` tool-use events, `null` otherwise.
- **`src/ui/App.tsx`**
  - Added `toolCalls: ToolCallEntry[]` state and `setToolCalls` setter.
  - Added `setToolCalls` to `AppSetters` type.
  - Added `computePanelWidths` helper for the 90/10 split.
  - `drainOrchestratorRun` gained a fifth `onToolCall` parameter; the loop calls `extractToolCall` after `mapOrchestratorEvent` and invokes the callback on non-null results.
  - Layout changed to `<Box flexDirection="row">` with `<BorderBox>` on the left and `<ToolCallPanel>` on the right.
- **`src/__tests__/mapEvent.test.ts`** — Updated `tool_use` assertions to expect `[]`; added full `extractToolCall` test suite (agent + stage events, null returns, `nextId` call counting, timestamp bounds).
- **`src/__tests__/App.test.tsx`** — All `drainOrchestratorRun` call sites updated to pass a no-op fifth argument; new `describe` block verifies `onToolCall` is invoked for `agent_event` and `stage_agent_event` tool-use events, and not invoked for other events.

## Outcome

All four stages completed successfully:

1. ✓ `add-tool-call-entry-type` — `ToolCallEntry` type added to `src/ui/types.ts`.
2. ✓ `create-tool-call-panel-component` — `ToolCallPanel.tsx` created with full test coverage.
3. ✓ `extract-tool-calls-in-map-event` — `extractToolCall` exported from `mapEvent.ts` with tests; `tool_use` history entries suppressed.
4. ✓ `split-layout-and-wire-sidebar` — `App.tsx` updated with vertical split layout, `onToolCall` wiring, and test updates.

No failures or incomplete stages were detected.
