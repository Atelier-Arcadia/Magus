import { type AgentEvent } from "./agent";
import type { ExecutionPlan, Stage, StagePlan } from "./execution-plan";
import { createCoder } from "./agents/coder";

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

// ── Channel ───────────────────────────────────────────────────────────────

/**
 * A simple async channel that merges pushes from multiple concurrent
 * producers into a single async-iterable stream for the consumer.
 */
type Channel<T> = {
  push(value: T): void;
  close(): void;
  [Symbol.asyncIterator](): AsyncIterator<T>;
};

function createChannel<T>(): Channel<T> {
  const buffer: T[] = [];
  let closed = false;
  let notify: (() => void) | null = null;

  function wake() {
    if (notify) {
      const fn = notify;
      notify = null;
      fn();
    }
  }

  return {
    push(value: T) {
      buffer.push(value);
      wake();
    },

    close() {
      closed = true;
      wake();
    },

    async *[Symbol.asyncIterator]() {
      while (true) {
        while (buffer.length > 0) {
          yield buffer.shift()!;
        }
        if (closed) return;
        await new Promise<void>((r) => {
          notify = r;
        });
      }
    },
  };
}

// ── Stage plan formatter ──────────────────────────────────────────────────

function bulletItems(items: string[]): string {
  return items.map((item) => `* ${item}`).join("\n");
}

function scopeItems(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function acItems(items: string[]): string {
  return items.map((item) => `* [ ] ${item}`).join("\n");
}

function formatContextBody(plan: StagePlan): string {
  const parts: string[] = [];
  if (plan.context.length > 0) parts.push(`Files to inspect:\n${bulletItems(plan.context)}`);
  if (plan.skills.length > 0) parts.push(`Skills:\n${bulletItems(plan.skills)}`);
  if (plan.targets.length > 0) parts.push(`Files to modify:\n${bulletItems(plan.targets)}`);
  return parts.join("\n\n");
}

function formatScopeBody(plan: StagePlan): string {
  const parts: string[] = [];
  if (plan.inScope.length > 0) parts.push(`In scope:\n${scopeItems(plan.inScope)}`);
  if (plan.outScope.length > 0) parts.push(`Out of scope:\n${scopeItems(plan.outScope)}`);
  return parts.join("\n\n");
}

/**
 * Convert a structured StagePlan object back into the markdown format
 * that coder agents expect as their prompt.
 */
export function formatStagePlan(id: string, plan: StagePlan): string {
  const sections: string[] = [`# Stage: ${id}`, "", plan.objective];

  const contextBody = formatContextBody(plan);
  if (contextBody) sections.push("", "## Context", "", contextBody);

  const scopeBody = formatScopeBody(plan);
  if (scopeBody) sections.push("", "## Scope", "", scopeBody);

  if (plan.acs.length > 0) {
    const acBody = `This work is only considered done when:\n${acItems(plan.acs)}`;
    sections.push("", "## Acceptance Criteria", "", acBody);
  }

  return sections.join("\n");
}

// ── Stage prompt builder ──────────────────────────────────────────────────

/**
 * Build the prompt for a stage, prepending context from completed
 * parent stages when the stage has dependencies.
 */
export function buildStagePrompt(stage: Stage, plan: ExecutionPlan): string {
  const stageMarkdown = formatStagePlan(stage.id, stage.plan);

  if (stage.dependencies.length === 0) {
    return stageMarkdown;
  }

  const parentSections = stage.dependencies
    .map((depId) => plan.stages.get(depId)!)
    .map((dep) => `### ${dep.id}\n${dep.result}`);

  return [
    "## Context from Completed Dependencies",
    "",
    ...parentSections,
    "",
    "---",
    "",
    stageMarkdown,
  ].join("\n");
}

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
