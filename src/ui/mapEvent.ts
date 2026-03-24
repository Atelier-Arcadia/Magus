import type { OrchestratorEvent, AgentStreamEvent } from "../engine/orchestrator";
import type { StageEndEvent, StageAgentEvent } from "../engine/executor";
import type { AgentEvent } from "../agents/common";
import type { HistoryEntry } from "./types";
import { formatToolCall } from "./format-tool-call";
import { renderPlanDetails } from "./render-plan";

// ── ID generator ──────────────────────────────────────────────────────────────

export function createIdGenerator(): () => string {
  let counter = 0;
  return () => `h${++counter}`;
}

// ── Inner mappers ──────────────────────────────────────────────────────────

function formatResult(num_turns: number, duration_ms: number, cost_usd: number): string {
  return `(${num_turns} turns, ${duration_ms}ms, $${cost_usd.toFixed(4)})`;
}

function mapAgentEvent(ae: AgentEvent, nextId: () => string): HistoryEntry[] {
  switch (ae.kind) {
    case "message":
      return [{ kind: "assistant_message", id: nextId(), text: ae.content }];
    case "tool_use":
      return [{ kind: "tool_use", id: nextId(), text: formatToolCall(ae.tool, ae.input) }];
    case "tool_result":
      return ae.is_error ? [{ kind: "tool_error", id: nextId(), text: ae.output }] : [];
    case "result":
      return [{ kind: "result", id: nextId(), text: formatResult(ae.num_turns, ae.duration_ms, ae.cost_usd) }];
    case "error":
      return [{ kind: "error", id: nextId(), text: ae.error }];
  }
}

function mapAgentStreamEvent(event: AgentStreamEvent, nextId: () => string): HistoryEntry[] {
  return mapAgentEvent(event.event, nextId);
}

function mapStageEnd(event: StageEndEvent, nextId: () => string): HistoryEntry[] {
  if (event.status === "completed") {
    return [{ kind: "stage_status", id: nextId(), text: `✓ Stage ${event.stageId} completed` }];
  }
  const suffix = event.error ? `: ${event.error}` : "";
  return [{ kind: "error", id: nextId(), text: `✗ Stage ${event.stageId} failed${suffix}` }];
}

function mapStageAgentEvent(event: StageAgentEvent, nextId: () => string): HistoryEntry[] {
  const se = event.event;
  const sid = event.stageId;
  switch (se.kind) {
    case "message":
      return [{ kind: "assistant_message", id: nextId(), text: se.content }];
    case "tool_use":
      return [{ kind: "tool_use", id: nextId(), text: `[${sid}] ${formatToolCall(se.tool, se.input)}` }];
    case "tool_result":
      return se.is_error ? [{ kind: "tool_error", id: nextId(), text: `[${sid}] tool error: ${se.output}` }] : [];
    case "result":
      return [{ kind: "result", id: nextId(), text: `[${sid}] ${formatResult(se.num_turns, se.duration_ms, se.cost_usd)}` }];
    case "error":
      return [{ kind: "error", id: nextId(), text: `[${sid}] error: ${se.error}` }];
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function mapOrchestratorEvent(
  event: OrchestratorEvent,
  nextId: () => string,
  verbose: boolean = false,
): HistoryEntry[] {
  switch (event.kind) {
    case "phase_start":
      return [{ kind: "phase", id: nextId(), label: event.phase }];
    case "phase_end":
      return [];
    case "agent_event":
      return mapAgentStreamEvent(event, nextId);
    case "plan_approval_request":
      return [{ kind: "info", id: nextId(), text: event.renderedPlan + "\n\n" + renderPlanDetails(event.plan, verbose) }];
    case "stage_start":
      return [{ kind: "stage_status", id: nextId(), text: `\u25b6 Stage: ${event.stageId}` }];
    case "stage_end":
      return mapStageEnd(event, nextId);
    case "stage_agent_event":
      return mapStageAgentEvent(event, nextId);
    case "session":
      return [{ kind: "info", id: nextId(), text: `Session: ${event.sessionId}` }];
  }
}
