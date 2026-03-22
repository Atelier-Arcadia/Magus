import type { AgentEvent } from "./agent";
import { createPlanner, type PlannerOutput } from "./agents/planner";
import { createExecutionPlan, type ExecutionPlan, type Stage, type StageDefinition } from "./execution-plan";
import { executePlan, type ExecutorEvent } from "./executor";
import { createMessageQueue } from "./message-queue";
import { createApprovalRequest, type ApprovalResult } from "./prompt-for-approval";
import { renderExecutionPlan } from "./render-plan";
import { savePlan } from "./save-plan";
import { createScribeRunner } from "./scribe-runner";

// ── Orchestrator events ──────────────────────────────────────────────────────────────────────────────────────────


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

export type OrchestratorEvent =
  | PhaseStartEvent
  | PhaseEndEvent
  | AgentStreamEvent
  | PlanApprovalEvent
  | SessionEvent
  | ExecutorEvent;


// ── Orchestrator ────────────────────────────────────────────────────────────────────────────────

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

// ── Pure helpers ────────────────────────────────────────────────────────────────────────

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

// ── Factory ──────────────────────────────────────────────────────────────────────────────────

export type OrchestratorDeps = {
  savePlan?: typeof savePlan;
};

export function createOrchestrator(deps: OrchestratorDeps = {}): Orchestrator {
  const doSavePlan = deps.savePlan ?? savePlan;
  const planner = createPlanner();
  const scribe = createScribeRunner();


  let plannerSessionId: string | undefined;

  return {
    async *run(context: OrchestratorContext): AsyncGenerator<OrchestratorEvent> {
      let prompt = context.prompt;

      // ── Resume: seed plannerSessionId and announce it to consumers ──────────
      if (context.sessionId) {
        plannerSessionId = context.sessionId;
        yield { kind: "session", sessionId: context.sessionId };
      }

      // ── Planning loop (repeats until the user approves) ─────────────────────
      let approvedPlan: ExecutionPlan | undefined;
      let previousPlan: ExecutionPlan | undefined;
      let plannerOutput: PlannerOutput | undefined;

      while (!approvedPlan) {
        // Reset structured output so a re-plan starts fresh.
        plannerOutput = undefined;

        yield { kind: "phase_start", phase: "planning" };

        for await (const event of planner({
          prompt,
          cwd: context.cwd,
          sessionId: plannerSessionId,
        })) {
          if (event.kind === "result") {
            plannerSessionId = event.session_id;
            if (event.structured_output) {
              plannerOutput = event.structured_output as PlannerOutput;
            }
          } else if (event.kind === "error" && event.session_id) {
            plannerSessionId = event.session_id;
          }

          yield { kind: "agent_event", phase: "planning", event };
        }

        yield { kind: "phase_end", phase: "planning" };

        // ── Build the plan and request approval ───────────────────────────
        if (!plannerOutput || plannerOutput.stages.length === 0) {
          if (previousPlan) {
            // Feedback round where the planner confirmed no changes —
            // treat the previous plan as implicitly approved.
            approvedPlan = previousPlan;
            break;
          }
          // First run and the planner didn't register any stages — nothing to do.
          if (plannerSessionId) {
            yield { kind: "session", sessionId: plannerSessionId };
          }
          return;
        }

        const stageDefinitions: StageDefinition[] = plannerOutput.stages.map((s) => ({
          id: s.id,
          plan: s.plan,
          dependencies: s.dependencies,
          queue: createMessageQueue(),
        }));
        const plan = createExecutionPlan(stageDefinitions);
        previousPlan = plan;
        const renderedPlan = renderExecutionPlan(plan);

        const request = createApprovalRequest();

        yield {
          kind: "plan_approval_request",
          plan,
          renderedPlan,
          resolve: request.resolve,
        };

        const result = await request.promise;

        if (result.approved) {
          approvedPlan = plan;
        } else {
          // User wants to refine — loop back with their feedback.
          prompt = result.feedback;
        }
      }

      // ── Save approved plan (non-fatal) ─────────────────────────────────────────
      try {
        await doSavePlan({
          renderedPlan: renderExecutionPlan(approvedPlan),
          prompt: context.prompt,
          cwd: context.cwd,
        });
      } catch {
        // non-fatal — continue to execution
      }

      // ── Execution phase ──────────────────────────────────────────────────────────────────────
      yield { kind: "phase_start", phase: "executing" };

      for await (const event of executePlan(approvedPlan, context.cwd)) {
        yield event;
      }

      yield { kind: "phase_end", phase: "executing" };

      // ── Scribe phase ───────────────────────────────────────────────────────────
      const scribePrompt = buildScribePrompt(
        context.prompt,
        approvedPlan,
        renderExecutionPlan(approvedPlan),
      );

      yield { kind: "phase_start", phase: "scribing" };

      for await (const event of scribe({ prompt: scribePrompt, cwd: context.cwd })) {
        yield { kind: "agent_event", phase: "scribing", event };
      }

      yield { kind: "phase_end", phase: "scribing" };

      // ── Final session event ────────────────────────────────────────────────────
      if (plannerSessionId) {
        yield { kind: "session", sessionId: plannerSessionId };
      }
    },
  };
}
