---
name: functional-cell-grid-rendering
description: Pattern for rendering text-based 2D layouts using immutable Cell lists instead of mutable grid arrays. Use when building or refactoring terminal/text renderers.
---

# Functional Cell-Based Grid Rendering

Current version: 0.0.1

A pattern for building text-based 2D layouts (box-drawing diagrams, tables, TUI elements) using pure functions that produce immutable cell lists, with mutation confined to a single boundary render function.

## Inputs

A rendering task that needs to place characters at specific (row, col) positions in a 2D text grid.

## Outputs

A composed string output built from pure cell-producing functions, with no mutable intermediate state.

## Failure Modes

- **Overlapping cells**: When two functions produce cells at the same position, the last one in the array wins during rendering. This is implicit and can cause visual bugs. Mitigate by ensuring layout functions produce non-overlapping regions.
- **Performance on large grids**: Flattening many small cell arrays creates GC pressure. For grids larger than ~200x200, consider a direct mutable approach instead.

## Scope

Applies to text/terminal rendering where characters are placed on a 2D grid. Not suitable for pixel-based or DOM rendering.

## Body

### Core Types

```typescript
type Cell = { row: number; col: number; char: string };
type Cells = ReadonlyArray<Cell>;
```

### Pattern

1. **Each visual element is a pure function returning `Cells`**: e.g., `boxCells(row, col, width, label): Cells` produces the cells for a box-drawing rectangle.
2. **Composition via spread**: Multiple cell lists are combined with `[...boxCells(...), ...connectorCells(...)]`. Order matters for overlap resolution.
3. **Single boundary function converts cells to string**: Only this function uses a mutable 2D array internally:

```typescript
function renderCells(width: number, height: number, cells: Cells): string {
  const grid = Array.from({ length: height }, () => Array<string>(width).fill(" "));
  for (const { row, col, char } of cells) {
    if (row >= 0 && row < height && col >= 0 && col < width) grid[row][col] = char;
  }
  return grid.map(r => r.join("").trimEnd()).join("\n").trimEnd();
}
```

4. **Helper for text spans**: A `cellsFromText(row, col, text): Cells` function converts a string into sequential cells starting at a position.

### Advantages Over Mutable Grid Class

- Each rendering function is independently testable (pure in, pure out).
- No shared mutable state between rendering phases.
- Composition is explicit — you can see exactly which cells contribute to the final output.
- The boundary function is trivially correct (just stamp cells onto a blank grid).

## Changes
* 0.0.1 - Initial version extracted from render-plan.ts refactoring
