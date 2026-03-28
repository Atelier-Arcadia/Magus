# Refactor render-plan to Functional Style and Move to ui/

## Summary

Refactored `render-plan.ts` to replace the mutable `Grid` class with a pure functional Cell-based rendering approach, then moved the module from `src/engine/` to `src/ui/` to better reflect its role as a presentation concern. All import paths, tests, and documentation (MAGUS.md) were updated accordingly.

## Key Decisions

- **Replaced mutable Grid class with immutable Cell type**: Instead of a `Grid` class with mutable `cells[][]`, `set()`, and `write()` methods, the new implementation uses a `Cell = { row, col, char }` type and `Cells = ReadonlyArray<Cell>`. Each rendering function produces a flat list of Cell entries, which are composed via spread/concat and rendered to a string in a single boundary function (`renderCells`).
- **Mutation confined to boundary**: The only mutable array exists inside `renderCells()`, which is a pure function that takes width, height, and cells, then produces a string. All other functions are pure and return `Cells`.
- **Decomposed into small pure functions**: Long functions were broken into focused helpers (e.g., `boxCells`, `connectorCells`, `edgeList`, `spanBits`, `mergeDirectionBits`, `computeMetrics`, `computeCenters`, `allBoxCells`, `allConnectorCells`), aligning with the coder agent's ≤12-line guideline.
- **Data-driven section definitions**: Stage plan formatting uses a `SECTION_DEFS` array of `SectionDef` objects, replacing repetitive conditional section-building logic with a declarative map-and-filter pattern.
- **Module moved to `src/ui/`**: Since `render-plan.ts` is purely about visual presentation (no engine logic), it was relocated from `src/engine/` to `src/ui/` alongside `mapEvent.ts` and `types.ts`.

## Implementation Details

- **`src/ui/render-plan.ts`**: Complete rewrite — 302 lines of functional code. Key types: `Cell`, `Cells`, `Metrics`, `SectionDef`. Public API unchanged: `renderExecutionPlan`, `extractSummary`, `extractFilesToModify`, `renderPlanDetails`.
- **`src/__tests__/render-plan.test.ts`**: Import path updated from `../engine/render-plan` to `../ui/render-plan`. All 18 existing tests pass without modification, confirming behavioral compatibility.
- **`src/engine/orchestrator.ts`**: Import updated to `../ui/render-plan`.
- **`src/ui/mapEvent.ts`**: Import updated to `./render-plan` (now a sibling).
- **`src/__tests__/orchestrator.test.ts`**: Mock path updated to `../ui/render-plan`.
- **`MAGUS.md`**: Directory tree updated to show `render-plan.ts` under `ui/`; section 3 of refactoring notes marked as completed.

## Outcome

Implementation succeeded. Both stages (refactor and move) completed cleanly. All tests pass. One gap was found during validation: the `magus-stage-plan-data-flow` skill file still referenced the old `engine/render-plan.ts` path in 5 locations — this was corrected as part of the scribe phase (bumped to v1.3.0).
