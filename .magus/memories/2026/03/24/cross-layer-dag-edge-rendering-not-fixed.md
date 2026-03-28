# Cross-Layer DAG Edge Rendering Fix — Incomplete

## Summary

A plan was created to fix cross-layer dependency edge rendering in `src/ui/render-plan.ts`. The DAG renderer correctly generates topological layers and draws connectors between adjacent layers, but edges that span multiple layers (e.g., D at layer 0 → E at layer 2) are silently dropped. The stage was marked as completed, but no code changes were made — the bug persists.

## Key Decisions

- The plan correctly identified the two root causes: `edgeList` only matches dependencies within a single parent layer, and `allConnectorCells` only iterates consecutive layer pairs.
- The intended fix involved drawing vertical pass-through lines through intermediate connector zones and box areas, then rendering junction routing at the final connector zone.
- No alternative approaches (e.g., inserting phantom nodes at intermediate layers) were considered in the plan.

## Implementation Details

- **No code was changed.** `edgeList` (line 101) still filters `child.dependencies` against `parentIds` from a single adjacent layer. `allConnectorCells` (line 193) still uses `layers.slice(0, -1).flatMap((layer, li) => ...)` which only pairs `layers[li]` with `layers[li+1]`.
- **No tests were added** for cross-layer edges. The existing test suite covers single-layer, two-layer, and cyclic graphs but never creates a dependency that skips a layer.
- The specific failing case from the prompt: tasks A, B, D at layer 0; C at layer 1 (depends A, B); E at layer 2 (depends C, D). The D→E edge is dropped.

## Outcome

**Failed** — the stage was reported as completed but the underlying bug was not addressed. The renderer still produces the same output shown in the prompt where task-d floats without a connection to task-e.

### Required Changes (not yet implemented)

1. Collect **all** edges across the full graph, not just adjacent-layer edges.
2. For edges spanning N layers, draw vertical `│` pass-through lines in the connector zones and box-adjacent rows of intermediate layers.
3. At the final connector zone before the target layer, perform the usual junction routing.
4. Add tests with the 10-task A–J DAG from the prompt to verify D→E renders correctly.
