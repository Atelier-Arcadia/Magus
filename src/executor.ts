import { type AgentEvent } from "./agent";
import { createChannel, type Channel } from "./channel";
import type { ExecutionPlan, Stage } from "./execution-plan";
import { buildStagePrompt, formatStagePlan } from "./stage-prompt";
import { createCoder } from "./agents/coder";

export { buildStagePrompt, formatStagePlan };

// ── Executor events ────────────────────────────────────────────────────────

export type StageStartEvent = {
  kind: "stage_start";
  stageId: string;
};

export type StageEndEvent = {
  kind: "stage_end";
  stageId: string;
  status: "completed" | "failed";
  error?: string;
};

export type StageAgentEvent = {
  kind: "stage_agent_event";
  stageId: string;
  event: AgentEvent;
};

export type ExecutorEvent = StageStartEvent | StageEndEvent | StageAgentEvent;

// ── Stage runner ──────────────────────────────────────────────────────────

/**
 * Run a single stage by creating a coder agent with the stage's config
 * and streaming its events into the shared channel.
 */
async function runStage(
  stage: Stage,
  plan: ExecutionPlan,
  channel: Channel<ExecutorEvent>,
  cwd?: string,
): Promise<void> {
  channel.push({ kind: "stage_start", stageId: stage.id });

  const agent = createCoder(stage.queue);
  const prompt = buildStagePrompt(stage, plan);
  let resultText: string | undefined;

  try {
    for await (const event of agent({ prompt, cwd })) {
      channel.push({ kind: "stage_agent_event", stageId: stage.id, event });
      if (event.kind === "result") {
        resultText = event.text;
      }
    }

    const result = resultText ?? `Stage "${stage.id}" completed without a summary.`;
    plan.markCompleted(stage.id, result);
    channel.push({
      kind: "stage_end",
      stageId: stage.id,
      status: "completed",
    });
  } catch (err) {
    plan.markFailed(stage.id);
    channel.push({
      kind: "stage_end",
      stageId: stage.id,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Executor ──────────────────────────────────────────────────────────────

/**
 * Execute an approved plan by driving stages through the DAG concurrently.
 *
 * Ready stages (those with all dependencies completed) are launched
 * immediately as concurrent promises, each running a coder agent.
 * As stages complete, newly unblocked stages are launched until the
 * entire plan is done.
 */
export async function* executePlan(
  plan: ExecutionPlan,
  cwd?: string,
): AsyncGenerator<ExecutorEvent> {
  const channel = createChannel<ExecutorEvent>();
  let inflight = 0;

  function launchReady() {
    for (const stage of plan.ready()) {
      plan.markRunning(stage.id);
      inflight++;
      runStage(stage, plan, channel, cwd);
    }
  }

  // Kick off all root stages.
  launchReady();

  // Drain the channel, launching newly ready stages as others complete.
  for await (const event of channel) {
    yield event;

    if (event.kind === "stage_end") {
      inflight--;
      launchReady();

      if (plan.done() && inflight === 0) {
        channel.close();
      }
    }
  }
}
