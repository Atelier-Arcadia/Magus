import type { AgentEvent } from "../agents/common";
import { createPlanner, type PlannerOutput } from "../agents/planner";
import { createExecutionPlan, detectCycles, type ExecutionPlan, type Stage, type StageDefinition } from "./execution-plan";
import { executePlan, type ExecutorEvent } from "./executor";
import { createMessageQueue } from "./message-queue";
import { createApprovalRequest, type ApprovalResult } from "./prompt-for-approval";
import { renderExecutionPlan, renderCyclicPlan } from "../ui/render-plan";
import { savePlan } from "./save-plan";
import { createScribeRunner } from "./scribe-runner";

// ── Orchestrator events ─────────────────────────────────────────────────────────

export type OrchestratorPhase = "planning" | "executing" | "scribing" | "done";

export type PhaseStartEvent = {
  kind: "phase_start";
  phase: OrchestratorPhase;
};

export type PhaseEndEvent = {
  kind: "phase_end";
  phase: OrchestratorPhase;
};

export type AgentStreamEvent = {
  kind: "agent_event";
  phase: OrchestratorPhase;
  event: AgentEvent;
};

/**
 * Emitted after planning completes to request the user's approval.
 *
 * The consumer should:
 *  1. Display `renderedPlan` to the user.
 *  2. Ask whether to approve or continue refining.
 *  3. Call `resolve()` with the user's decision.
 *
 * The orchestrator blocks on this event until `resolve` is called.
 */
export type PlanApprovalEvent = {
  kind: "plan_approval_request";
  plan: ExecutionPlan;
  renderedPlan: string;
  resolve(result: ApprovalResult): void;
};

export type SessionEvent = {
  kind: "session";
  sessionId: string;
};

// ── Session stats ────────────────────────────────────────────────────────────

export type SessionStats = {
  wallClockMs: number;
  totalAgentMs: number;
  totalTurns: number;
  totalCostUsd: number;
};

export type SessionStatsEvent = {
  kind: "session_stats";
  stats: SessionStats;
};

/**
 * Emitted when the planner produces a plan with cyclic stage dependencies.
 * The orchestrator will automatically re-invoke the planner with corrective feedback.
 */
export type CycleDetectedEvent = {
  kind: "cycle_detected";
  renderedPlan: string;
  cycles: string[][];
};

export type OrchestratorEvent =
  | PhaseStartEvent
  | PhaseEndEvent
  | AgentStreamEvent
  | PlanApprovalEvent
  | SessionEvent
  | SessionStatsEvent
  | CycleDetectedEvent
  | ExecutorEvent;

// ── Orchestrator ────────────────────────────────────────────────────────────────────

export type OrchestratorContext = {
  prompt: string;
  cwd?: string;
  sessionId?: string;
};

export type Orchestrator = {
  /**
   * Run the orchestrator for a given user prompt.
   * Yields events as the planner and executor work.
   */
  run(context: OrchestratorContext): AsyncGenerator<OrchestratorEvent>;
};

// ── Pure helpers ────────────────────────────────────────────────────────────────────

function renderStageSection(stage: Stage): string {
  const deps =
    stage.dependencies.length > 0 ? stage.dependencies.join(", ") : "none";
  return [
    `### Stage: ${stage.id}`,
    `**Status:** ${stage.status}`,
    `**Dependencies:** ${deps}`,
    "**Plan:**",
    stage.plan.objective,
    "",
  ].join("\n");
}

export function buildScribePrompt(
  userPrompt: string,
  plan: ExecutionPlan,
  renderedPlan: string,
): string {
  const stageDetails = Array.from(plan.stages.values())
    .map(renderStageSection)
    .join("\n");

  return [
    "# Execution Report",
    "",
    "## Original Request",
    userPrompt,
    "",
    "## Plan",
    renderedPlan,
    "",
    "## Stage Details",
    stageDetails,
    "---",
    "",
    "Please validate the implementation and write a memory file documenting this work.",
  ].join("\n");
}

// ── Stats helpers ───────────────────────────────────────────────────────────────────────

type ExtractedStats = { durationMs: number; costUsd: number; numTurns: number };
type AgentStatsAccumulator = { totalAgentMs: number; totalTurns: number; totalCostUsd: number };

export function extractAgentStats(event: OrchestratorEvent): ExtractedStats | null {
  if (
    (event.kind === "agent_event" || event.kind === "stage_agent_event") &&
    event.event.kind === "result"
  ) {
    return { durationMs: event.event.duration_ms, costUsd: event.event.cost_usd, numTurns: event.event.num_turns };
  }
  return null;
}

function accumulate(acc: AgentStatsAccumulator, stats: ExtractedStats): AgentStatsAccumulator {
  return {
    totalAgentMs: acc.totalAgentMs + stats.durationMs,
    totalTurns: acc.totalTurns + stats.numTurns,
    totalCostUsd: acc.totalCostUsd + stats.costUsd,
  };
}

function msToHMS(ms: number): { hours: number; minutes: number; seconds: number } {
  const totalSeconds = Math.floor(ms / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function formatHMS(ms: number): string {
  const { hours, minutes, seconds } = msToHMS(ms);
  return `${hours} hours, ${minutes} minutes and ${seconds} seconds.`;
}

export function formatSessionReport(stats: SessionStats): string {
  return `# ── Orchestrator ─ Session Statistics ──────────────────────────────────────

The session completed in:
  - ${formatHMS(stats.wallClockMs)}
The total time spent by the agents is estimated to be:
  - ${formatHMS(stats.totalAgentMs)}
    
The agents ran for a total of **${stats.totalTurns} turns**.
The total estimated cost of this session was: **$${stats.totalCostUsd.toFixed(4)} USD**.
# ───────────────────────────────────────────────────────────────────────────`
}

// ── Planning types ───────────────────────────────────────────────────────────────────────────

type PlanningResult = { plan: ExecutionPlan; sessionId?: string };

type PlannerIterationResult = { output?: PlannerOutput; sessionId?: string };

type IterationOutcome =
  | { kind: "approved"; plan: ExecutionPlan; sessionId?: string }
  | { kind: "feedback"; prompt: string; previousPlan?: ExecutionPlan; sessionId?: string }
  | { kind: "no_stages"; sessionId?: string; previousPlan?: ExecutionPlan };

// ── Planning helpers ───────────────────────────────────────────────────────────────

function updateFromPlannerEvent(
  event: AgentEvent,
  sessionId: string | undefined,
  output: PlannerOutput | undefined,
): [string | undefined, PlannerOutput | undefined] {
  if (event.kind === "result") {
    return [event.session_id, (event.structured_output as PlannerOutput | undefined) ?? output];
  }
  if (event.kind === "error" && event.session_id) {
    return [event.session_id, output];
  }
  return [sessionId, output];
}

function buildPlan(stages: PlannerOutput["stages"]): ExecutionPlan {
  return createExecutionPlan(
    stages.map((s): StageDefinition => ({
      id: s.id,
      plan: s.plan,
      dependencies: s.dependencies,
      queue: createMessageQueue(),
    })),
  );
}

async function* runPlannerIteration(
  planner: ReturnType<typeof createPlanner>,
  params: { prompt: string; cwd?: string; sessionId?: string },
): AsyncGenerator<OrchestratorEvent, PlannerIterationResult> {
  let sessionId = params.sessionId;
  let output: PlannerOutput | undefined;
  yield { kind: "phase_start", phase: "planning" };
  for await (const event of planner(params)) {
    [sessionId, output] = updateFromPlannerEvent(event, sessionId, output);
    yield { kind: "agent_event", phase: "planning", event };
  }
  yield { kind: "phase_end", phase: "planning" };
  return { sessionId, output };
}

async function* requestApproval(
  plan: ExecutionPlan,
): AsyncGenerator<OrchestratorEvent, ApprovalResult> {
  const request = createApprovalRequest();
  yield { kind: "plan_approval_request", plan, renderedPlan: renderExecutionPlan(plan), resolve: request.resolve };
  return await request.promise;
}

async function* resolveNoStages(
  outcome: Extract<IterationOutcome, { kind: "no_stages" }>,
): AsyncGenerator<OrchestratorEvent, PlanningResult | undefined> {
  if (outcome.previousPlan) return { plan: outcome.previousPlan, sessionId: outcome.sessionId };
  if (outcome.sessionId) yield { kind: "session", sessionId: outcome.sessionId };
  return undefined;
}

function formatCyclePath(cycle: string[]): string {
  const [first, ...rest] = cycle;
  return `${first} depends on ${rest.join(" which depends on ")}`;
}

function buildCycleFeedback(cycles: string[][]): string {
  const cycleList = cycles.map((c) => `* ${formatCyclePath(c)}`).join("\n");
  return [
    "<feedback>",
    "The plan you produced contains cyclic dependencies. Please restructure the stages to form a directed acyclic graph (DAG).",
    "",
    "Cycles detected:",
    cycleList,
    "</feedback>",
  ].join("\n");
}

async function* planningIteration(
  planner: ReturnType<typeof createPlanner>,
  params: { prompt: string; cwd?: string; sessionId?: string },
  previousPlan: ExecutionPlan | undefined,
): AsyncGenerator<OrchestratorEvent, IterationOutcome> {
  const { sessionId, output } = yield* runPlannerIteration(planner, params);
  if (!output || output.stages.length === 0) {
    return { kind: "no_stages", sessionId, previousPlan };
  }
  const cycles = detectCycles(output.stages);
  if (cycles.length > 0) {
    const renderedPlan = renderCyclicPlan(output.stages);
    yield { kind: "cycle_detected", renderedPlan, cycles };
    return { kind: "feedback", prompt: buildCycleFeedback(cycles), previousPlan, sessionId };
  }
  const plan = buildPlan(output.stages);
  const approval = yield* requestApproval(plan);
  if (approval.approved) return { kind: "approved", plan, sessionId };
  return { kind: "feedback", prompt: approval.feedback, previousPlan: plan, sessionId };
}

async function* planningLoop(
  planner: ReturnType<typeof createPlanner>,
  context: OrchestratorContext,
): AsyncGenerator<OrchestratorEvent, PlanningResult | undefined> {
  let prompt = context.prompt;
  let sessionId = context.sessionId;
  let previousPlan: ExecutionPlan | undefined;
  while (true) {
    const outcome = yield* planningIteration(planner, { prompt, cwd: context.cwd, sessionId }, previousPlan);
    if (outcome.kind === "approved") return { plan: outcome.plan, sessionId: outcome.sessionId };
    if (outcome.kind === "no_stages") return yield* resolveNoStages(outcome);
    ({ prompt, previousPlan, sessionId } = outcome);
  }
}

// ── Phase generators ───────────────────────────────────────────────────────────────

async function* executionPhase(
  plan: ExecutionPlan,
  cwd?: string,
): AsyncGenerator<OrchestratorEvent> {
  yield { kind: "phase_start", phase: "executing" };
  for await (const event of executePlan(plan, cwd)) {
    yield event;
  }
  yield { kind: "phase_end", phase: "executing" };
}

async function* scribePhase(
  scribe: ReturnType<typeof createScribeRunner>,
  userPrompt: string,
  plan: ExecutionPlan,
  cwd?: string,
): AsyncGenerator<OrchestratorEvent> {
  const scribePrompt = buildScribePrompt(userPrompt, plan, renderExecutionPlan(plan));
  yield { kind: "phase_start", phase: "scribing" };
  for await (const event of scribe({ prompt: scribePrompt, cwd })) {
    yield { kind: "agent_event", phase: "scribing", event };
  }
  yield { kind: "phase_end", phase: "scribing" };
}

// ── Pipeline ──────────────────────────────────────────────────────────────────────────────

async function* runPipeline(
  planner: ReturnType<typeof createPlanner>,
  scribe: ReturnType<typeof createScribeRunner>,
  doSavePlan: typeof savePlan,
  context: OrchestratorContext,
): AsyncGenerator<OrchestratorEvent> {
  if (context.sessionId) yield { kind: "session", sessionId: context.sessionId };
  const result = yield* planningLoop(planner, context);
  if (!result) return;
  const { plan, sessionId } = result;
  try {
    await doSavePlan({ renderedPlan: renderExecutionPlan(plan), prompt: context.prompt, cwd: context.cwd });
  } catch {}
  yield* executionPhase(plan, context.cwd);
  yield* scribePhase(scribe, context.prompt, plan, context.cwd);
  if (sessionId) yield { kind: "session", sessionId };
}

// ── Factory ──────────────────────────────────────────────────────────────────────────

export type OrchestratorDeps = {
  savePlan?: typeof savePlan;
};

export function createOrchestrator(deps: OrchestratorDeps = {}): Orchestrator {
  const doSavePlan = deps.savePlan ?? savePlan;
  const planner = createPlanner();
  const scribe = createScribeRunner();

  return {
    async *run(context: OrchestratorContext): AsyncGenerator<OrchestratorEvent> {
      const startTime = Date.now();
      let acc: AgentStatsAccumulator = { totalAgentMs: 0, totalTurns: 0, totalCostUsd: 0 };
      for await (const event of runPipeline(planner, scribe, doSavePlan, context)) {
        yield event;
        const extracted = extractAgentStats(event);
        if (extracted) acc = accumulate(acc, extracted);
      }
      yield {
        kind: "session_stats",
        stats: { wallClockMs: Date.now() - startTime, ...acc },
      };
    },
  };
}
