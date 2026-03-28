# Tool Call Panel Moved Inside Main Border Box

## Summary

The `ToolCallPanel` (tool call audit log) was relocated from being a sibling element beside the `BorderBox` to living **inside** it. The main content area and the tool panel are now separated by a vertical `│` divider rendered as a column of characters, all enclosed within the single outer border drawn by `BorderBox`. This gives the UI a unified bounding box containing both the conversation history and the tool call sidebar.

## Key Decisions

- **Single outer border**: Rather than having the `ToolCallPanel` float outside the `BorderBox`, the entire UI is wrapped in one `BorderBox` at `width={columns}`. This satisfies the requirement that both panels share a common border.
- **Vertical divider via character column**: A `<Box flexDirection="column">` containing `rows - 2` individual `<Text>│</Text>` elements is used to draw the full-height vertical separator. This matches the manual-character style already used by `BorderBox` itself (which renders its own `│` border walls as characters).
- **`computePanelWidths` formula change**: The function now accounts for the two `BorderBox` wall characters (`-2`) and the one divider character (`-1`) when computing `mainWidth`. Old formula: `columns - sidebarWidth`. New formula: `columns - 2 - 1 - sidebarWidth`.
- **`mainWidth` is now pure interior**: Previously `mainWidth` included the border chars (since `BorderBox` got `width={mainWidth}` and consumed 2 of those chars for its walls). Now `mainWidth` is the actual available content columns left of the divider.

## Implementation Details

- **`src/ui/App.tsx`**
  - `computePanelWidths(columns)`: Updated formula — `mainWidth = columns - 2 - 1 - sidebarWidth`, clamped to `Math.max(1, ...)`. `sidebarWidth` unchanged at `max(15, floor(columns * 0.2))`.
  - JSX restructured: `<BorderBox width={columns} height={rows}>` (was `width={mainWidth}`), with children wrapped in `<Box flexDirection="row" flexGrow={1}>`.
  - Left slot: `<Box flexDirection="column" width={mainWidth}>` containing `MessageHistory`, the approval prompt, and the text input.
  - Center slot: `<Box flexDirection="column">` with `Array.from({ length: rows - 2 }, ...)` producing a `│` character per row — the full-height divider.
  - Right slot: `<ToolCallPanel items={toolCalls} width={sidebarWidth} height={rows - 2} />` — height reduced from `rows` to `rows - 2` to match the interior height of `BorderBox`.
  - `MessageHistory` width updated to `mainWidth - 2` (2-char padding; previously `-4` which included 2 border chars that are no longer part of `mainWidth`).

- **`src/ui/ToolCallPanel.tsx`**
  - Comment on the `width` prop updated from `// panel width (~20 % of terminal columns)` to `// panel width (~20 % of terminal columns, inside main border)` to reflect the new layout context.

- **`src/__tests__/App.test.tsx`**
  - `computePanelWidths` test suite updated to assert the new `columns - 2 - 1 - sidebarWidth` formula.
  - Explicit test added: for `columns = 100`, `mainWidth` must equal `77` (`100 - 2 - 1 - 20 = 77`).
  - Tests cover the minimum sidebar clamp, 20% fraction, and boundary cases (75, 76, 100, 200 columns).

## Outcome

**Success.** All changes were implemented as planned in the single `move-tool-panel-inside-border` stage. The `ToolCallPanel` is now rendered inside the `BorderBox`, separated from the main content area by a left-border divider column. The `computePanelWidths` formula was corrected to account for the `BorderBox` walls and the divider character, and the test suite was updated to validate the new formula including the explicit `mainWidth = 77` case for a 100-column terminal.
