---
name: dag-cross-layer-edge-routing
description: Techniques for rendering dependency edges that span multiple layers in a layered DAG diagram. Use when building or modifying text-based DAG renderers.
---

# DAG Cross-Layer Edge Routing

Current version: 0.0.1

When rendering a layered DAG as a text diagram, edges between non-adjacent layers require special handling. A naive adjacent-layer-only approach silently drops these edges.

## Inputs

- A list of topological layers (arrays of nodes)
- A dependency graph where edges may span 2+ layers
- A layout with known box positions and connector zones between layers

## Outputs

- Visual connector lines (vertical pass-throughs and junction routing) for all edges, including those spanning multiple layers

## Failure Modes

- **Silent edge dropping**: If edge collection only considers adjacent layers, cross-layer edges vanish with no error. Always collect edges from the full graph, not layer pairs.
- **Column collisions**: Pass-through lines may overlap with boxes in intermediate layers. Reserve a column or route around occupied cells.
- **Missing connector zones**: Cross-layer edges need vertical lines in every intermediate connector zone AND through intermediate box rows. Drawing only in connector zones leaves gaps.

## Scope

Applies to layered (Sugiyama-style) DAG rendering in text/terminal. Not applicable to force-directed or circular graph layouts.

## Body

### The Problem

In a layered DAG layout, nodes are assigned to horizontal layers by topological depth. Connectors are drawn in "zones" between consecutive layers. When `edgeList` only collects edges where the parent is in layer N and the child is in layer N+1, any edge from layer N to layer N+2 (or beyond) is dropped.

### Two Approaches

#### Approach 1: Phantom/Waypoint Nodes

Insert invisible placeholder nodes at each intermediate layer along a cross-layer edge. This converts every multi-layer edge into a chain of adjacent-layer edges, so the existing adjacent-layer rendering logic works unmodified.

- **Pros**: Minimal changes to rendering pipeline; naturally handles column reservation.
- **Cons**: Inflates node count; placeholders consume horizontal space in their layer; layout width calculation must account for them.

#### Approach 2: Pass-Through Line Drawing

Keep layers as-is but extend the connector rendering to draw vertical `│` lines through:
1. The connector zone directly below the source layer (exit line)
2. Every intermediate box row (passing beside or through the gap between boxes)
3. Every intermediate connector zone (vertical continuation)
4. The final connector zone above the target layer (junction routing + `▼` entry)

- **Pros**: No phantom nodes; preserves original layout compactness.
- **Cons**: Must carefully manage which rows get pass-through lines; box rows are 3 lines tall so the vertical line must continue through all 3 rows.

### Implementation Checklist

1. **Collect all edges globally**: Iterate every node, pair each dependency with its source, compute the layer span.
2. **Partition edges**: Separate adjacent-layer edges (span=1) from cross-layer edges (span>1).
3. **Render adjacent edges** with existing connector logic.
4. **Render cross-layer edges**: For each intermediate layer pair, add a vertical `│` cell at the source node's center column in the connector zone rows AND the box rows of the intermediate layer.
5. **Final zone**: At the connector zone immediately above the target layer, include the cross-layer edge in the normal junction routing merge so horizontal spans and arrows render correctly.
6. **Test**: Always test with a graph containing at least one edge that spans 2+ layers.

## Changes

* 0.0.1 - Initial version documenting cross-layer edge routing patterns for layered DAG renderers
