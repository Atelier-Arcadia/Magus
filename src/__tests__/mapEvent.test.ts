import { describe, expect, test } from "bun:test";
import { createIdGenerator, mapOrchestratorEvent } from "../ui/mapEvent";
import { formatToolCall } from "../format-tool-call";

// ── ID generator ────────────────────────────────────────────────────────────

describe("createIdGenerator", () => {
  test("first call returns 'h1'", () => {
    const nextId = createIdGenerator();
    expect(nextId()).toBe("h1");
  });

  test("successive calls increment the counter", () => {
    const nextId = createIdGenerator();
    expect(nextId()).toBe("h1");
    expect(nextId()).toBe("h2");
    expect(nextId()).toBe("h3");
  });

  test("two independent generators do not share state", () => {
    const a = createIdGenerator();
    const b = createIdGenerator();
    a(); // h1
    a(); // h2
    expect(b()).toBe("h1");
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a fresh generator that always produces the given fixed id. */
function fixedId(id: string): () => string {
  return () => id;
}

/** Builds a sequential generator identical to the real one but starting fresh. */
function freshId() {
  return createIdGenerator();
}

// ── phase_start ──────────────────────────────────────────────────────────────

describe("mapOrchestratorEvent – phase_start", () => {
  test("returns a single 'phase' entry with the phase label", () => {
    const result = mapOrchestratorEvent(
      { kind: "phase_start", phase: "planning" },
      fixedId("h1"),
    );
    expect(result).toEqual([{ kind: "phase", id: "h1", label: "planning" }]);
  });

  test("uses the id returned by nextId", () => {
    const result = mapOrchestratorEvent(
      { kind: "phase_start", phase: "executing" },
      fixedId("h42"),
    );
    expect(result[0].id).toBe("h42");
  });

  test("calls nextId exactly once", () => {
    let calls = 0;
    mapOrchestratorEvent({ kind: "phase_start", phase: "scribing" }, () => {
      calls++;
      return "hX";
    });
    expect(calls).toBe(1);
  });
});

// ── phase_end ────────────────────────────────────────────────────────────────

describe("mapOrchestratorEvent – phase_end", () => {
  test("returns an empty array", () => {
    expect(
      mapOrchestratorEvent({ kind: "phase_end", phase: "planning" }, fixedId("h1")),
    ).toEqual([]);
  });

  test("never calls nextId", () => {
    let calls = 0;
    mapOrchestratorEvent({ kind: "phase_end", phase: "executing" }, () => {
      calls++;
      return "hX";
    });
    expect(calls).toBe(0);
  });
});

// ── agent_event ──────────────────────────────────────────────────────────────

describe("mapOrchestratorEvent – agent_event / message", () => {
  test("returns an 'assistant_message' entry with the message content", () => {
    const result = mapOrchestratorEvent(
      {
        kind: "agent_event",
        phase: "planning",
        event: { kind: "message", content: "Hello world" },
      },
      fixedId("h1"),
    );
    expect(result).toEqual([{ kind: "assistant_message", id: "h1", text: "Hello world" }]);
  });
});

describe("mapOrchestratorEvent – agent_event / tool_use", () => {
  test("returns a 'tool_use' entry with a formatted tool call string", () => {
    const result = mapOrchestratorEvent(
      {
        kind: "agent_event",
        phase: "planning",
        event: { kind: "tool_use", id: "tu1", tool: "Read", input: { file_path: "/a.ts" } },
      },
      fixedId("h1"),
    );
    expect(result).toEqual([
      { kind: "tool_use", id: "h1", text: formatToolCall("Read", { file_path: "/a.ts" }) },
    ]);
  });
});

describe("mapOrchestratorEvent – agent_event / tool_result (error)", () => {
  test("returns a 'tool_error' entry when is_error is true", () => {
    const result = mapOrchestratorEvent(
      {
        kind: "agent_event",
        phase: "planning",
        event: { kind: "tool_result", id: "tr1", tool: "Read", output: "boom", is_error: true },
      },
      fixedId("h1"),
    );
    expect(result).toEqual([{ kind: "tool_error", id: "h1", text: "boom" }]);
  });

  test("returns an empty array when is_error is false", () => {
    const result = mapOrchestratorEvent(
      {
        kind: "agent_event",
        phase: "planning",
        event: { kind: "tool_result", id: "tr1", tool: "Read", output: "ok", is_error: false },
      },
      fixedId("h1"),
    );
    expect(result).toEqual([]);
  });

  test("does not call nextId for non-error tool_result", () => {
    let calls = 0;
    mapOrchestratorEvent(
      {
        kind: "agent_event",
        phase: "planning",
        event: { kind: "tool_result", id: "tr1", tool: "Read", output: "ok", is_error: false },
      },
      () => { calls++; return "hX"; },
    );
    expect(calls).toBe(0);
  });
});

describe("mapOrchestratorEvent – agent_event / result", () => {
  test("returns a 'result' entry with turns, duration and cost formatted", () => {
    const result = mapOrchestratorEvent(
      {
        kind: "agent_event",
        phase: "executing",
        event: {
          kind: "result",
          text: "done",
          num_turns: 3,
          duration_ms: 1200,
          cost_usd: 0.0025,
          session_id: "s1",
        },
      },
      fixedId("h1"),
    );
    expect(result).toEqual([
      { kind: "result", id: "h1", text: "(3 turns, 1200ms, $0.0025)" },
    ]);
  });

  test("cost is formatted to four decimal places", () => {
    const result = mapOrchestratorEvent(
      {
        kind: "agent_event",
        phase: "planning",
        event: {
          kind: "result",
          text: "",
          num_turns: 1,
          duration_ms: 500,
          cost_usd: 0.1,
          session_id: "s1",
        },
      },
      fixedId("h1"),
    );
    expect(result[0]).toMatchObject({ text: "(1 turns, 500ms, $0.1000)" });
  });
});

describe("mapOrchestratorEvent – agent_event / error", () => {
  test("returns an 'error' entry with the error message", () => {
    const result = mapOrchestratorEvent(
      {
        kind: "agent_event",
        phase: "planning",
        event: { kind: "error", error: "something went wrong" },
      },
      fixedId("h1"),
    );
    expect(result).toEqual([{ kind: "error", id: "h1", text: "something went wrong" }]);
  });
});

// ── plan_approval_request ────────────────────────────────────────────────────

describe("mapOrchestratorEvent – plan_approval_request", () => {
  test("returns an 'info' entry with renderedPlan as the text", () => {
    const result = mapOrchestratorEvent(
      {
        kind: "plan_approval_request",
        plan: {} as any,
        renderedPlan: "# Stage A\nDo the thing",
        resolve: () => {},
      },
      fixedId("h1"),
    );
    expect(result).toEqual([{ kind: "info", id: "h1", text: "# Stage A\nDo the thing" }]);
  });
});

// ── stage_start ──────────────────────────────────────────────────────────────

describe("mapOrchestratorEvent – stage_start", () => {
  test("returns a 'stage_status' entry prefixed with the play symbol", () => {
    const result = mapOrchestratorEvent(
      { kind: "stage_start", stageId: "build" },
      fixedId("h1"),
    );
    expect(result).toEqual([{ kind: "stage_status", id: "h1", text: "▶ Stage: build" }]);
  });
});

// ── stage_end ────────────────────────────────────────────────────────────────

describe("mapOrchestratorEvent – stage_end (completed)", () => {
  test("returns a 'stage_status' entry with checkmark on success", () => {
    const result = mapOrchestratorEvent(
      { kind: "stage_end", stageId: "build", status: "completed" },
      fixedId("h1"),
    );
    expect(result).toEqual([{ kind: "stage_status", id: "h1", text: "✓ Stage build completed" }]);
  });
});

describe("mapOrchestratorEvent – stage_end (failed)", () => {
  test("returns an 'error' entry with cross symbol when failed", () => {
    const result = mapOrchestratorEvent(
      { kind: "stage_end", stageId: "build", status: "failed" },
      fixedId("h1"),
    );
    expect(result).toEqual([{ kind: "error", id: "h1", text: "✗ Stage build failed" }]);
  });

  test("appends the error message when provided", () => {
    const result = mapOrchestratorEvent(
      { kind: "stage_end", stageId: "build", status: "failed", error: "timeout" },
      fixedId("h1"),
    );
    expect(result).toEqual([{ kind: "error", id: "h1", text: "✗ Stage build failed: timeout" }]);
  });
});

// ── stage_agent_event ────────────────────────────────────────────────────────

describe("mapOrchestratorEvent – stage_agent_event / message", () => {
  test("returns an 'assistant_message' entry with the content", () => {
    const result = mapOrchestratorEvent(
      {
        kind: "stage_agent_event",
        stageId: "build",
        event: { kind: "message", content: "thinking…" },
      },
      fixedId("h1"),
    );
    expect(result).toEqual([{ kind: "assistant_message", id: "h1", text: "thinking…" }]);
  });
});

describe("mapOrchestratorEvent – stage_agent_event / tool_use", () => {
  test("returns a 'tool_use' entry prefixed with [stageId]", () => {
    const result = mapOrchestratorEvent(
      {
        kind: "stage_agent_event",
        stageId: "build",
        event: { kind: "tool_use", id: "tu1", tool: "Glob", input: { pattern: "**/*.ts" } },
      },
      fixedId("h1"),
    );
    expect(result).toEqual([
      {
        kind: "tool_use",
        id: "h1",
        text: "[build] " + formatToolCall("Glob", { pattern: "**/*.ts" }),
      },
    ]);
  });
});

describe("mapOrchestratorEvent – stage_agent_event / tool_result (error)", () => {
  test("returns a 'tool_error' entry prefixed with [stageId] when is_error", () => {
    const result = mapOrchestratorEvent(
      {
        kind: "stage_agent_event",
        stageId: "build",
        event: { kind: "tool_result", id: "tr1", tool: "Glob", output: "not found", is_error: true },
      },
      fixedId("h1"),
    );
    expect(result).toEqual([
      { kind: "tool_error", id: "h1", text: "[build] tool error: not found" },
    ]);
  });

  test("returns an empty array when is_error is false", () => {
    const result = mapOrchestratorEvent(
      {
        kind: "stage_agent_event",
        stageId: "build",
        event: { kind: "tool_result", id: "tr1", tool: "Glob", output: "ok", is_error: false },
      },
      fixedId("h1"),
    );
    expect(result).toEqual([]);
  });
});

describe("mapOrchestratorEvent – stage_agent_event / result", () => {
  test("returns a 'result' entry prefixed with [stageId]", () => {
    const result = mapOrchestratorEvent(
      {
        kind: "stage_agent_event",
        stageId: "build",
        event: {
          kind: "result",
          text: "",
          num_turns: 5,
          duration_ms: 800,
          cost_usd: 0.0012,
          session_id: "s1",
        },
      },
      fixedId("h1"),
    );
    expect(result).toEqual([
      { kind: "result", id: "h1", text: "[build] (5 turns, 800ms, $0.0012)" },
    ]);
  });
});

describe("mapOrchestratorEvent – stage_agent_event / error", () => {
  test("returns an 'error' entry prefixed with [stageId]", () => {
    const result = mapOrchestratorEvent(
      {
        kind: "stage_agent_event",
        stageId: "build",
        event: { kind: "error", error: "agent crashed" },
      },
      fixedId("h1"),
    );
    expect(result).toEqual([
      { kind: "error", id: "h1", text: "[build] error: agent crashed" },
    ]);
  });
});

// ── session ──────────────────────────────────────────────────────────────────

describe("mapOrchestratorEvent – session", () => {
  test("returns an 'info' entry with 'Session: <id>'", () => {
    const result = mapOrchestratorEvent(
      { kind: "session", sessionId: "abc-123" },
      fixedId("h1"),
    );
    expect(result).toEqual([{ kind: "info", id: "h1", text: "Session: abc-123" }]);
  });
});

// ── Purity ───────────────────────────────────────────────────────────────────

describe("mapOrchestratorEvent – purity", () => {
  test("same input event produces the same output text regardless of call order", () => {
    const event = { kind: "phase_start" as const, phase: "planning" as const };
    const r1 = mapOrchestratorEvent(event, fixedId("h1"));
    const r2 = mapOrchestratorEvent(event, fixedId("h1"));
    expect(r1[0]).toEqual(r2[0]);
  });

  test("function does not mutate the input event", () => {
    const event = { kind: "phase_start" as const, phase: "planning" as const };
    const before = JSON.stringify(event);
    mapOrchestratorEvent(event, freshId());
    expect(JSON.stringify(event)).toBe(before);
  });

  test("IDs increment across multiple event mappings using a shared generator", () => {
    const nextId = createIdGenerator();
    const e1 = mapOrchestratorEvent({ kind: "phase_start", phase: "planning" }, nextId);
    const e2 = mapOrchestratorEvent({ kind: "session", sessionId: "s1" }, nextId);
    expect(e1[0].id).toBe("h1");
    expect(e2[0].id).toBe("h2");
  });
});
