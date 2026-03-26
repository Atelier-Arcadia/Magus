import type { ExecutionPlan, Stage, StageStatus, StagePlan } from "../engine/execution-plan";

// ── Core types ─────────────────────────────────────────────────────────────

type Cell = { row: number; col: number; char: string };
type Cells = ReadonlyArray<Cell>;

// ── Status icons ─────────────────────────────────────────────────────────────

const STATUS_ICON: Record<StageStatus, string> = {
  pending:   "○",
  running:   "◉",
  completed: "✓",
  failed:    "✗",
};

// ── Direction bits for junction routing ──────────────────────────────────────

const UP    = 1;
const DOWN  = 2;
const LEFT  = 4;
const RIGHT = 8;

const JUNCTION: Record<number, string> = {
  [UP]:                       "│",
  [DOWN]:                     "│",
  [UP | DOWN]:                "│",
  [LEFT]:                     "─",
  [RIGHT]:                    "─",
  [LEFT | RIGHT]:             "─",
  [UP | RIGHT]:               "└",
  [UP | LEFT]:                "┘",
  [DOWN | RIGHT]:             "┌",
  [DOWN | LEFT]:              "┐",
  [UP | LEFT | RIGHT]:        "┴",
  [DOWN | LEFT | RIGHT]:      "┬",
  [UP | DOWN | RIGHT]:        "├",
  [UP | DOWN | LEFT]:         "┤",
  [UP | DOWN | LEFT | RIGHT]: "┼",
};

// ── Stage plan section definitions ───────────────────────────────────────────────────────────────────

type SectionDef = {
  header: string;
  items: (p: StagePlan) => string[];
  renderItem?: (i: string) => string;
};

const SECTION_DEFS: SectionDef[] = [
  { header: "Context",             items: (p) => p.context },
  { header: "Skills",              items: (p) => p.skills },
  { header: "Files to modify",     items: (p) => p.targets },
  { header: "In scope",            items: (p) => p.inScope },
  { header: "Out of scope",        items: (p) => p.outScope },
  { header: "Acceptance criteria", items: (p) => p.acs, renderItem: (a) => `- [ ] ${a}` },
];

// ── Layout metrics ──────────────────────────────────────────────────────────────

type Metrics = {
  innerWidth: number;
  boxWidth: number;
  boxHeight: number;
  gap: number;
  connectorZoneHeight: number;
  totalWidth: number;
  totalHeight: number;
};

// ── Cell construction ───────────────────────────────────────────────────────────────────

const cellsFromText = (row: number, col: number, text: string): Cells =>
  Array.from(text).map((char, i) => ({ row, col: col + i, char }));

// Boundary function: renders a flat list of Cell entries into a string.
// Mutation is confined to the local grid array for string construction.
function renderCells(width: number, height: number, cells: Cells): string {
  const grid = Array.from({ length: height }, () => Array<string>(width).fill(" "));
  for (const { row, col, char } of cells) {
    if (row >= 0 && row < height && col >= 0 && col < width) grid[row][col] = char;
  }
  return grid.map((r) => r.join("").trimEnd()).join("\n").trimEnd();
}

// ── Box cells ────────────────────────────────────────────────────────────────────────

function boxCells(row: number, col: number, innerWidth: number, stage: Stage): Cells {
  const icon   = STATUS_ICON[stage.status];
  const label  = ` ${icon} ${stage.id}`;
  const padded = label.padEnd(innerWidth);
  return [
    ...cellsFromText(row,     col, "┌" + "─".repeat(innerWidth) + "┐"),
    ...cellsFromText(row + 1, col, "│" + padded + "│"),
    ...cellsFromText(row + 2, col, "└" + "─".repeat(innerWidth) + "┘"),
  ];
}

// ── Global edge collection ──────────────────────────────────────────────────────────────

type GlobalEdge = Readonly<{
  srcCol: number;
  dstCol: number;
  srcLayer: number;
  dstLayer: number;
}>;

function globalEdgeList(
  layers: ReadonlyArray<ReadonlyArray<Stage>>,
  centerOf: ReadonlyMap<string, number>,
): ReadonlyArray<GlobalEdge> {
  const layerOf = new Map<string, number>();
  layers.forEach((layer, li) => layer.forEach((s) => layerOf.set(s.id, li)));

  return layers.flatMap((layer, dstLi) =>
    layer.flatMap((stage) =>
      stage.dependencies
        .filter((depId) => layerOf.has(depId))
        .map((depId): GlobalEdge => ({
          srcCol: centerOf.get(depId)!,
          dstCol: centerOf.get(stage.id)!,
          srcLayer: layerOf.get(depId)!,
          dstLayer: dstLi,
        })),
    ),
  );
}

// ── Connector cells ────────────────────────────────────────────────────────────────────

function spanBits(pCol: number, cCol: number): ReadonlyArray<[number, number]> {
  if (pCol === cCol) return [];
  const lo = Math.min(pCol, cCol);
  const hi = Math.max(pCol, cCol);
  return Array.from({ length: hi - lo + 1 }, (_, i) => {
    const c = lo + i;
    return [c, (c > lo ? LEFT : 0) | (c < hi ? RIGHT : 0)] as [number, number];
  });
}

const setBit = (m: Map<number, number>, col: number, bit: number): Map<number, number> =>
  new Map([...m, [col, (m.get(col) ?? 0) | bit]]);

function addEdgeBits(bits: Map<number, number>, pCol: number, cCol: number): Map<number, number> {
  const withEndpoints = setBit(setBit(bits, pCol, UP), cCol, DOWN);
  return spanBits(pCol, cCol).reduce((m, [c, b]) => setBit(m, c, b), withEndpoints);
}

function mergeDirectionBits(edges: ReadonlyArray<[number, number]>): Map<number, number> {
  return edges.reduce<Map<number, number>>(
    (bits, [pCol, cCol]) => addEdgeBits(bits, pCol, cCol),
    new Map(),
  );
}

function connectorCells(startRow: number, edges: ReadonlyArray<[number, number]>): Cells {
  if (edges.length === 0) return [];
  const dirBits  = mergeDirectionBits(edges);
  const exits    = [...new Set(edges.map(([p]) => p))].map((col) => ({ row: startRow,     col, char: "│" }));
  const routes   = [...dirBits]
    .filter(([, b]) => JUNCTION[b])
    .map(([col, b]) => ({ row: startRow + 1, col, char: JUNCTION[b] }));
  const entries  = [...new Set(edges.map(([, c]) => c))].map((col) => ({ row: startRow + 2, col, char: "▼" }));
  return [...exits, ...routes, ...entries];
}

// ── Layout computation ───────────────────────────────────────────────────────────────────────

function computeMetrics(stages: Stage[], layers: Stage[][]): Metrics {
  const maxIdLen            = Math.max(...stages.map((s) => s.id.length));
  const innerWidth          = maxIdLen + 4;
  const boxWidth            = innerWidth + 2;
  const gap                 = 3;
  const boxHeight           = 3;
  const connectorZoneHeight = 3;
  const maxLayerBoxes       = Math.max(...layers.map((l) => l.length));
  const totalWidth          = maxLayerBoxes * boxWidth + (maxLayerBoxes - 1) * gap;
  const totalHeight         = layers.length * boxHeight + (layers.length - 1) * connectorZoneHeight;
  return { innerWidth, boxWidth, boxHeight, gap, connectorZoneHeight, totalWidth, totalHeight };
}

function stageLeft(bi: number, layerLength: number, metrics: Metrics): number {
  const { boxWidth, gap, totalWidth } = metrics;
  const layerWidth = layerLength * boxWidth + (layerLength - 1) * gap;
  return Math.floor((totalWidth - layerWidth) / 2) + bi * (boxWidth + gap);
}

// Computes the horizontal centre column for every stage across all layers.
// All layers are processed upfront so connectors can reference any stage centre.
function computeCenters(layers: Stage[][], metrics: Metrics): Map<string, number> {
  return new Map(
    layers.flatMap((layer) =>
      layer.map((stage, bi) => [
        stage.id,
        stageLeft(bi, layer.length, metrics) + Math.floor(metrics.boxWidth / 2),
      ] as [string, number]),
    ),
  );
}

function allBoxCells(layers: Stage[][], metrics: Metrics): Cells {
  return layers.flatMap((layer, li) => {
    const row = li * (metrics.boxHeight + metrics.connectorZoneHeight);
    return layer.flatMap((stage, bi) =>
      boxCells(row, stageLeft(bi, layer.length, metrics), metrics.innerWidth, stage),
    );
  });
}

function passThroughCells(row: number, col: number, height: number): Cells {
  return Array.from({ length: height }, (_, i) => ({ row: row + i, col, char: "│" }));
}

function allConnectorCells(
  layers: Stage[][],
  centerOf: Map<string, number>,
  metrics: Metrics,
): Cells {
  const edges = globalEdgeList(layers, centerOf);
  const stride = metrics.boxHeight + metrics.connectorZoneHeight;
  const cells: Cell[] = [];

  for (let zi = 0; zi < layers.length - 1; zi++) {
    const connStart = zi * stride + metrics.boxHeight;

    // Pass-through lines in this connector zone (edges that continue past layer zi+1)
    const passing = edges.filter((e) => e.srcLayer <= zi && e.dstLayer > zi + 1);
    for (const e of passing) {
      cells.push(...passThroughCells(connStart, e.srcCol, metrics.connectorZoneHeight));
    }

    // Pass-through lines in the box layer below (layer zi+1) for edges continuing further
    if (zi + 1 < layers.length - 1) {
      const boxStart = (zi + 1) * stride;
      for (const e of passing) {
        cells.push(...passThroughCells(boxStart, e.srcCol, metrics.boxHeight));
      }
    }

    // Edges terminating at layer zi+1 (both adjacent and cross-layer) — rendered with junction routing
    const terminating: [number, number][] = edges
      .filter((e) => e.dstLayer === zi + 1)
      .map((e) => [e.srcCol, e.dstCol]);
    cells.push(...connectorCells(connStart, terminating));
  }

  return cells;
}

// ── Layer computation ────────────────────────────────────────────────────────────────────

// Pure recursive layer assignment: layer = 1 + max(dependency layers), 0 for roots.
const computeLayerOf = (id: string, stages: ReadonlyMap<string, Stage>): number => {
  const stage = stages.get(id)!;
  if (stage.dependencies.length === 0) return 0;
  return 1 + Math.max(...stage.dependencies.map((d) => computeLayerOf(d, stages)));
};

function computeLayers(stages: ReadonlyMap<string, Stage>): Stage[][] {
  const stageList = Array.from(stages.values());
  const maxLayer  = Math.max(...stageList.map((s) => computeLayerOf(s.id, stages)));
  return Array.from({ length: maxLayer + 1 }, (_, li) =>
    stageList.filter((s) => computeLayerOf(s.id, stages) === li).sort((a, b) => a.id.localeCompare(b.id)),
  );
}

// ── Public API: DAG diagram ─────────────────────────────────────────────────────────────────────────

/**
 * Render an ExecutionPlan as a text-based box-and-arrow DAG diagram.
 *
 * Stages are arranged in topological layers (roots at top) with
 * box-drawing connectors showing dependency edges between adjacent layers.
 */
export function renderExecutionPlan(plan: ExecutionPlan): string {
  const stages = Array.from(plan.stages.values());
  if (stages.length === 0) return "(empty plan)";
  const layers   = computeLayers(plan.stages);
  const metrics  = computeMetrics(stages, layers);
  const centerOf = computeCenters(layers, metrics);
  const cells: Cells = [
    ...allBoxCells(layers, metrics),
    ...allConnectorCells(layers, centerOf, metrics),
  ];
  return renderCells(metrics.totalWidth, metrics.totalHeight, cells);
}

// ── Cycle-safe layer computation ──────────────────────────────────────────────────────────────

type StageNode = Readonly<{ id: string; dependencies: ReadonlyArray<string> }>;

// Minimal Stage stub for rendering: status=pending, empty plan/queue/result.
const stubStage = (id: string, dependencies: string[]): Stage => ({
  id,
  dependencies,
  status: "pending",
  plan: { objective: "", context: [], skills: [], targets: [], inScope: [], outScope: [], acs: [] },
  queue: { push: () => {}, events: [] } as Stage["queue"],
  result: "",
});

// DFS layer assignment with cycle guard. Back-edges (visiting.has) contribute layer 0,
// breaking the cycle without infinite recursion. Results are memoised.
function computeCycleSafeLayer(
  id: string,
  nodes: ReadonlyMap<string, StageNode>,
  visiting: Set<string>,
  memo: Map<string, number>,
): number {
  if (memo.has(id)) return memo.get(id)!;
  if (visiting.has(id)) return 0;
  const node = nodes.get(id);
  if (!node || node.dependencies.length === 0) { memo.set(id, 0); return 0; }
  visiting.add(id);
  const layer = 1 + Math.max(...node.dependencies.map((d) => computeCycleSafeLayer(d, nodes, visiting, memo)));
  visiting.delete(id);
  memo.set(id, layer);
  return layer;
}

// Builds non-empty layers from a possibly-cyclic stage list.
// Back-edges are ignored; empty layers produced by the assignment are filtered out.
function computeCyclicLayers(
  stages: ReadonlyArray<{ id: string; dependencies: string[] }>,
): Stage[][] {
  const nodes    = new Map<string, StageNode>(stages.map((s) => [s.id, s]));
  const memo     = new Map<string, number>();
  const visiting = new Set<string>();
  const layerOf  = (id: string) => computeCycleSafeLayer(id, nodes, visiting, memo);
  const maxLayer = Math.max(...stages.map((s) => layerOf(s.id)));
  const allLayers = Array.from({ length: maxLayer + 1 }, (_, li) =>
    stages
      .filter((s) => layerOf(s.id) === li)
      .map((s) => stubStage(s.id, s.dependencies))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  return allLayers.filter((layer) => layer.length > 0);
}

// ── Public API: cyclic-tolerant DAG diagram ────────────────────────────────────────────────────

/**
 * Render a box-and-arrow diagram for a stage graph that may contain cycles.
 *
 * Uses cycle-safe DFS layer assignment so back-edges return layer 0 instead
 * of infinite-looping. Back-edges are silently omitted from connectors.
 * All stage ids will appear in labelled boxes in the output.
 */
export function renderCyclicPlan(
  stages: ReadonlyArray<{ id: string; dependencies: string[] }>,
): string {
  if (stages.length === 0) return "(empty plan)";
  const layers    = computeCyclicLayers(stages);
  const allStages = layers.flat();
  const metrics   = computeMetrics(allStages, layers);
  const centerOf  = computeCenters(layers, metrics);
  const cells: Cells = [
    ...allBoxCells(layers, metrics),
    ...allConnectorCells(layers, centerOf, metrics),
  ];
  return renderCells(metrics.totalWidth, metrics.totalHeight, cells);
}

// ── Public API: plan detail helpers ───────────────────────────────────────────────────────────────

/**
 * Return the high-level summary of a stage plan.
 */
export function extractSummary(plan: StagePlan): string {
  return plan.objective;
}

/**
 * Format the target file paths from a stage plan as a bullet list.
 */
export function extractFilesToModify(plan: StagePlan): string {
  return plan.targets.map((t) => `- ${t}`).join("\n");
}

// ── Stage plan formatting ─────────────────────────────────────────────────────────────────────────

const renderItems = (items: string[], renderItem?: (i: string) => string): string =>
  items.map(renderItem ?? ((i) => `- ${i}`)).join("\n");

const formatSection = (def: SectionDef, plan: StagePlan): string | null => {
  const items = def.items(plan);
  return items.length > 0 ? `## ${def.header}\n\n${renderItems(items, def.renderItem)}` : null;
};

function formatStagePlan(plan: StagePlan): string {
  const extra = SECTION_DEFS
    .map((def) => formatSection(def, plan))
    .filter((s): s is string => s !== null);
  return [plan.objective, ...extra].join("\n\n");
}

// ── Stage rendering helpers ───────────────────────────────────────────────────────────────────────────

const stageDepLine = (stage: Stage): string =>
  stage.dependencies.length > 0 ? `Dependencies: ${stage.dependencies.join(", ")}\n\n` : "";

const renderVerboseStage = (stage: Stage): string =>
  `### ${stage.id}\n\n${stageDepLine(stage)}${formatStagePlan(stage.plan)}`;

function renderSummaryStage(stage: Stage): string {
  const files        = extractFilesToModify(stage.plan);
  const filesSection = files ? `\nFiles to modify:\n${files}` : "";
  return `### ${stage.id}\n${extractSummary(stage.plan)}${filesSection}`;
}

// ── Public API: plan details ─────────────────────────────────────────────────────────────────────────────

/**
 * Render stage plan details as formatted text, in topological order.
 */
export function renderPlanDetails(plan: ExecutionPlan, verbose: boolean = false): string {
  if (!plan.stages) return "(no stages)";
  const stages = Array.from(plan.stages.values());
  if (stages.length === 0) return "(no stages)";
  const stageList = computeLayers(plan.stages).flat();
  const render    = verbose ? renderVerboseStage : renderSummaryStage;
  return stageList.map(render).join("\n\n---\n\n");
}
