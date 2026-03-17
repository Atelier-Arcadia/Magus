import type { AgentEvent } from "./agent";
import { createPlanner } from "./agents/planner";
import { createExecutionPlan, type ExecutionPlan } from "./execution-plan";
import { executePlan, type ExecutorEvent } from "./executor";
import { createMessageQueue } from "./message-queue";
import { createApprovalRequest, type ApprovalResult } from "./prompt-for-approval";
import { renderExecutionPlan } from "./render-plan";
import { createStageSink } from "./tools/plan-stage";

// ── Orchestrator events ─────────────────────────────────────────────────────

export type OrchestratorPhase = "planning" | "executing" | "done";

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
 * Emitted after planning completes to request the user’s approval.
 *
 * The consumer should:
 *  1. Display `renderedPlan` to the user.
 *  2. Ask whether to approve or continue refining.
 *  3. Call `resolve()` with the user’s decision.
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


// ── Orchestrator ────────────────────────────────────────────────────────────

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

export function createOrchestrator(): Orchestrator {
  const queue = createMessageQueue();
  const sink = createStageSink();
  const planner = createPlanner(queue, sink);

  let plannerSessionId: string | undefined;

  return {
    async *run(context: OrchestratorContext): AsyncGenerator<OrchestratorEvent> {
      let prompt = context.prompt;

      // ── Resume: seed plannerSessionId and announce it to consumers ──────
      if (context.sessionId) {
        plannerSessionId = context.sessionId;
        yield { kind: "session", sessionId: context.sessionId };
      }

      // ── Planning loop (repeats until the user approves) ───────────────────
      let approvedPlan: ExecutionPlan | undefined;
      let previousPlan: ExecutionPlan | undefined;

      while (!approvedPlan) {
        // Reset the sink so a re-plan starts fresh.
        sink.stages.length = 0;

        yield { kind: "phase_start", phase: "planning" };

        for await (const event of planner({
          prompt,
          cwd: context.cwd,
          sessionId: plannerSessionId,
        })) {
          if (event.kind === "result") {
            plannerSessionId = event.session_id;
          } else if (event.kind === "error" && event.session_id) {
            plannerSessionId = event.session_id;
          }

          yield { kind: "agent_event", phase: "planning", event };
        }

        yield { kind: "phase_end", phase: "planning" };

        // ── Build the plan and request approval ───────────────────────────
        if (sink.stages.length === 0) {
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

        const plan = createExecutionPlan(sink.stages);
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

      // ── Execution phase ─────────────────────────────────────────────────
      yield { kind: "phase_start", phase: "executing" };

      for await (const event of executePlan(approvedPlan, context.cwd)) {
        yield event;
      }

      yield { kind: "phase_end", phase: "executing" };

      // ── Final session event ──────────────────────────────────────────────
      if (plannerSessionId) {
        yield { kind: "session", sessionId: plannerSessionId };
      }
    },
  };
}
