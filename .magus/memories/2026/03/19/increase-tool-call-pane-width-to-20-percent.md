# Increase Tool Call Pane Width to 20%

## Summary

The tool call sidebar panel in the terminal UI was widened from 10% to 20% of the terminal column count. This involved a one-line change to the `computePanelWidths` function in `src/ui/App.tsx` and a corresponding comment update in `src/ui/ToolCallPanel.tsx` to keep documentation accurate.

## Key Decisions

- **Multiplier raised from `0.1` to `0.2`** — The sidebar already had a `Math.max(15, ...)` floor guard, so no additional minimum-width handling was needed; only the multiplier required changing.
- **Comment kept in sync** — The inline JSDoc comment in `ToolCallPanel.tsx` explicitly calls out the percentage, so it was updated alongside the logic change to prevent stale documentation.
- **No test changes needed** — The plan confirmed there are no existing unit tests for `computePanelWidths`, so no test updates were required.

## Implementation Details

- **`src/ui/App.tsx` (line 148)** — `computePanelWidths` function:
  ```ts
  // Before
  const sidebarWidth = Math.max(15, Math.floor(columns * 0.1));
  // After
  const sidebarWidth = Math.max(15, Math.floor(columns * 0.2));
  ```
- **`src/ui/ToolCallPanel.tsx` (line 9)** — Type comment on the `width` prop:
  ```ts
  // Before: // panel width (~10 % of terminal columns)
  // After:  // panel width (~20 % of terminal columns)
  ```
- No other files reference the sidebar width fraction; the change is fully self-contained.

## Outcome

Implementation succeeded. Both targeted edits were verified in place: `App.tsx` uses `0.2` and `ToolCallPanel.tsx` carries the updated `~20 %` comment. The stage completed with no failures.
