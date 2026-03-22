import type { ExecutionPlan, Stage, StageStatus, StagePlan } from "./execution-plan";

// ── Status icons ────────────────────────────────────────────────────────────

const STATUS_ICON: Record<StageStatus, string> = {
  pending: "○",
  running: "◉",
  completed: "✓",
  failed: "✗",
};

// ── Direction bits for junction routing ─────────────────────────────────────

const UP = 1;
const DOWN = 2;
const LEFT = 4;
const RIGHT = 8;

const JUNCTION: Record<number, string> = {
  [UP]:                         "│",
  [DOWN]:                       "│",
  [UP | DOWN]:                  "│",
  [LEFT]:                       "─",
  [RIGHT]:                      "─",
  [LEFT | RIGHT]:               "─",
  [UP | RIGHT]:                 "└",
  [UP | LEFT]:                  "┘",
  [DOWN | RIGHT]:               "┌",
  [DOWN | LEFT]:                "┐",
  [UP | LEFT | RIGHT]:          "┴",
  [DOWN | LEFT | RIGHT]:        "┬",
  [UP | DOWN | RIGHT]:          "├",
  [UP | DOWN | LEFT]:           "┤",
  [UP | DOWN | LEFT | RIGHT]:   "┼",
};

// ── Character grid ──────────────────────────────────────────────────────────

class Grid {
  private cells: string[][];

  constructor(
    public width: number,
    public height: number,
  ) {
    this.cells = Array.from({ length: height }, () =>
      Array<string>(width).fill(" "),
    );
  }

  set(row: number, col: number, ch: string): void {
    if (row >= 0 && row < this.height && col >= 0 && col < this.width) {
      this.cells[row][col] = ch;
    }
  }

  write(row: number, col: number, text: string): void {
    for (let i = 0; i < text.length; i++) {
      this.set(row, col + i, text[i]);
    }
  }

  toString(): string {
    return this.cells
      .map((row) => row.join("").trimEnd())
      .join("\n")
      .trimEnd();
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Render an ExecutionPlan as a text-based box-and-arrow DAG diagram.
 *
 * Stages are arranged in topological layers (roots at top) with
 * box-drawing connectors showing dependency edges between adjacent layers.
 */
export function renderExecutionPlan(plan: ExecutionPlan): string {
  const stages = Array.from(plan.stages.values());
  if (stages.length === 0) return "(empty plan)";

  // ── Compute topological layers ─────────────────────────────────────────
  const layers = computeLayers(plan.stages);

  // ── Box dimensions (uniform) ───────────────────────────────────────────
  const maxIdLen = Math.max(...stages.map((s) => s.id.length));
  const innerWidth = maxIdLen + 4; // " \u25cb <id> "
  const boxWidth = innerWidth + 2; // \u2502...\u2502
  const boxHeight = 3;
  const gap = 3;
  const connectorZoneHeight = 3;

  // ── Grid dimensions ────────────────────────────────────────────────────
  const maxLayerBoxes = Math.max(...layers.map((l) => l.length));
  const totalWidth = maxLayerBoxes * boxWidth + (maxLayerBoxes - 1) * gap;
  const totalHeight =
    layers.length * boxHeight + (layers.length - 1) * connectorZoneHeight;

  const grid = new Grid(totalWidth, totalHeight);

  // ── Place boxes and record their center columns ─────────────────────
  const centerOf = new Map<string, number>();
  let currentRow = 0;

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const layerWidth = layer.length * boxWidth + (layer.length - 1) * gap;
    const layerOffset = Math.floor((totalWidth - layerWidth) / 2);

    for (let bi = 0; bi < layer.length; bi++) {
      const stage = layer[bi];
      const left = layerOffset + bi * (boxWidth + gap);
      centerOf.set(stage.id, left + Math.floor(boxWidth / 2));
      drawBox(grid, currentRow, left, innerWidth, stage);
    }

    // ── Draw connectors to next layer ─────────────────────────────────────
    if (li < layers.length - 1) {
      const nextLayer = layers[li + 1];
      drawConnectors(
        grid,
        currentRow + boxHeight,
        layer,
        nextLayer,
        centerOf,
      );
      currentRow += boxHeight + connectorZoneHeight;
    } else {
      currentRow += boxHeight;
    }
  }

  return grid.toString();
}

// ── Box drawing ─────────────────────────────────────────────────────────────

function drawBox(
  grid: Grid,
  row: number,
  col: number,
  innerWidth: number,
  stage: Stage,
): void {
  const icon = STATUS_ICON[stage.status];
  const label = ` ${icon} ${stage.id}`;
  const padded = label.padEnd(innerWidth);

  grid.write(row, col, "\u250c" + "\u2500".repeat(innerWidth) + "\u2510");
  grid.write(row + 1, col, "\u2502" + padded + "\u2502");
  grid.write(row + 2, col, "\u2514" + "\u2500".repeat(innerWidth) + "\u2518");
}

// ── Connector drawing ──────────────────────────────────────────────────────

function drawConnectors(
  grid: Grid,
  startRow: number,
  parentLayer: Stage[],
  childLayer: Stage[],
  centerOf: Map<string, number>,
): void {
  // Collect edges between these adjacent layers.
  const parentIds = new Set(parentLayer.map((s) => s.id));
  const edges: [number, number][] = [];

  for (const child of childLayer) {
    for (const depId of child.dependencies) {
      if (!parentIds.has(depId)) continue;
      const pCol = centerOf.get(depId)!;
      const cCol = centerOf.get(child.id)!;
      edges.push([pCol, cCol]);
    }
  }

  if (edges.length === 0) return;

  // The connector zone has 3 rows:
  //   exitRow:  \u2502 below each parent that has a downward edge
  //   routeRow: horizontal routing with junction characters
  //   entryRow: \u25bc above each child that has an upward edge
  const exitRow = startRow;
  const routeRow = startRow + 1;
  const entryRow = startRow + 2;

  // Build direction bits for every column touched on the routing row.
  const bits = new Map<number, number>();

  for (const [pCol, cCol] of edges) {
    bits.set(pCol, (bits.get(pCol) ?? 0) | UP);
    bits.set(cCol, (bits.get(cCol) ?? 0) | DOWN);

    if (pCol !== cCol) {
      const lo = Math.min(pCol, cCol);
      const hi = Math.max(pCol, cCol);
      for (let c = lo; c <= hi; c++) {
        let b = bits.get(c) ?? 0;
        if (c > lo) b |= LEFT;
        if (c < hi) b |= RIGHT;
        bits.set(c, b);
      }
    }
  }

  // Draw exit row.
  const parentExits = new Set(edges.map(([p]) => p));
  for (const col of parentExits) {
    grid.set(exitRow, col, "\u2502");
  }

  // Draw routing row.
  for (const [col, b] of bits) {
    const ch = JUNCTION[b];
    if (ch) grid.set(routeRow, col, ch);
  }

  // Draw entry row.
  const childEntries = new Set(edges.map(([, c]) => c));
  for (const col of childEntries) {
    grid.set(entryRow, col, "\u25bc");
  }
}

// ── Plan detail helpers ───────────────────────────────────────────────────

/**
 * Return the high-level summary of a stage plan.
 * Directly returns the structured `objective` field.
 */
export function extractSummary(plan: StagePlan): string {
  return plan.objective;
}

/**
 * Format the target file paths from a stage plan as a bullet list.
 * Returns a dash-prefixed bullet string per target, or an empty string
 * when the plan has no targets.
 */
export function extractFilesToModify(plan: StagePlan): string {
  return plan.targets.map((t) => `- ${t}`).join("\n");
}

/**
 * Format a StagePlan into human-readable markdown sections.
 * Used by the verbose rendering path of `renderPlanDetails`.
 */
function formatStagePlan(plan: StagePlan): string {
  const sections: string[] = [plan.objective];
  const bullet = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

  if (plan.context.length > 0)
    sections.push(`## Context\n\n${bullet(plan.context)}`);
  if (plan.skills.length > 0)
    sections.push(`## Skills\n\n${bullet(plan.skills)}`);
  if (plan.targets.length > 0)
    sections.push(`## Files to modify\n\n${bullet(plan.targets)}`);
  if (plan.inScope.length > 0)
    sections.push(`## In scope\n\n${bullet(plan.inScope)}`);
  if (plan.outScope.length > 0)
    sections.push(`## Out of scope\n\n${bullet(plan.outScope)}`);
  if (plan.acs.length > 0)
    sections.push(`## Acceptance criteria\n\n${plan.acs.map((a) => `- [ ] ${a}`).join("\n")}`);

  return sections.join("\n\n");
}

// ── Plan details ──────────────────────────────────────────────────────────

/**
 * Render stage plan details as formatted text, in topological order.
 *
 * When `verbose` is true the full plan and dependency info are included.
 * When `verbose` is false (default) only the summary and files-to-modify are shown.
 */
export function renderPlanDetails(plan: ExecutionPlan, verbose: boolean = false): string {
  if (!plan.stages) return "(no stages)";
  const stages = Array.from(plan.stages.values());
  if (stages.length === 0) return "(no stages)";

  const layers = computeLayers(plan.stages);

  if (verbose) {
    return layers
      .flat()
      .map((stage) => {
        const deps =
          stage.dependencies.length > 0
            ? `Dependencies: ${stage.dependencies.join(", ")}\n\n`
            : "";
        return `### ${stage.id}\n\n${deps}${formatStagePlan(stage.plan)}`;
      })
      .join("\n\n---\n\n");
  }

  return layers
    .flat()
    .map((stage) => {
      const summary = extractSummary(stage.plan);
      const files = extractFilesToModify(stage.plan);
      const filesSection = files ? `\nFiles to modify:\n${files}` : "";
      return `### ${stage.id}\n${summary}${filesSection}`;
    })
    .join("\n\n---\n\n");
}

// ── Layer computation ──────────────────────────────────────────────────────────

/**
 * Assign each stage to a layer based on longest path from any root.
 * Returns an array of layers, each containing stages sorted by id.
 */
function computeLayers(stages: Map<string, Stage>): Stage[][] {
  const layerOf = new Map<string, number>();

  function getLayer(id: string): number {
    if (layerOf.has(id)) return layerOf.get(id)!;
    const stage = stages.get(id)!;
    if (stage.dependencies.length === 0) {
      layerOf.set(id, 0);
      return 0;
    }
    const maxDep = Math.max(...stage.dependencies.map((d) => getLayer(d)));
    const layer = maxDep + 1;
    layerOf.set(id, layer);
    return layer;
  }

  for (const id of stages.keys()) {
    getLayer(id);
  }

  // Group stages into layers, sorted by id within each layer.
  const maxLayer = Math.max(...Array.from(layerOf.values()));
  const layers: Stage[][] = Array.from({ length: maxLayer + 1 }, () => []);

  for (const [id, layer] of layerOf) {
    layers[layer].push(stages.get(id)!);
  }

  for (const layer of layers) {
    layer.sort((a, b) => a.id.localeCompare(b.id));
  }

  return layers;
}
