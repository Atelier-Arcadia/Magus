import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";


// ── Shared mock state ──────────────────────────────────────────────────────

/**
 * Structured output produced by the mock planner for the current invocation.
 * Reset to null at the start of each mock planner call so that the second
 * invocation in an implicit-approval loop sees no stages.
 */
let plannerStructuredOutput: any = null;

/**
 * Per-invocation session IDs for the auto-yielded result event.
 * Index 0 → first planner call, index 1 → second call, etc.
 */
let plannerResultSessionIds: (string | undefined)[] = [];

/** Events the mock planner will yield when iterated. */
let plannerEventQueue: any[] = [];

/**
 * Side-effects run at the START of each planner invocation (before any
 * yields). Indexed by invocation count — the first call uses index 0, etc.
 * Falls back to null (no side-effect) for invocations beyond the array length.
 */
let plannerSideEffects: ((() => void) | null)[] = [];

/** Tracks how many times the mock planner has been invoked. */
let plannerCallCount = 0;

/**
 * Queue of approval results. Each call to `createApprovalRequest` shifts
 * the next result off the front. When empty, defaults to `{ approved: true }`.
 */
let approvalResultQueue: any[] = [];

/** Tracks how many times the mock scribe agent function has been called. */
let scribeCallCount = 0;

/** Events the mock scribe will yield when iterated. */
let scribeEventQueue: any[] = [];

/** Calls captured by the mock savePlan. */
let savePlanCalls: any[] = [];

/** Queue of `string[][]` values returned by the mock detectCycles (one per call). */
let detectCyclesQueue: string[][][] = [];

/** Params captured by the mock planner on each invocation (index = call index). */
let plannerCapturedParams: any[] = [];

/** How many times the mock createExecutionPlan has been called. */
let createExecutionPlanCallCount = 0;

// ── Module mocks ───────────────────────────────────────────────────────────

mock.module("../engine/message-queue", () => ({
  createMessageQueue: () => ({}),
}));

mock.module("../agents/planner", () => ({
  createPlanner: () =>
    async function* (_ctx: any) {
      const idx = plannerCallCount++;
      plannerCapturedParams.push(_ctx);
      // Reset structured output at the start of each invocation so that a
      // second planning round (implicit-approval loop) sees no stages by default.
      plannerStructuredOutput = null;
      const sideEffect = plannerSideEffects[idx] ?? null;
      sideEffect?.();
      for (const event of plannerEventQueue) {
        yield event;
      }
      // Always emit a result event so the orchestrator can capture session_id
      // and structured_output for this invocation.
      yield {
        kind: "result",
        text: "",
        duration_ms: 100,
        cost_usd: 0,
        num_turns: 1,
        session_id: plannerResultSessionIds[idx],
        structured_output: plannerStructuredOutput,
      };
    },
}));

mock.module("../ui/render-plan", () => ({
  renderExecutionPlan: () => "Rendered Plan",
  renderCyclicPlan: () => "Cyclic Plan Render",
}));

mock.module("../engine/execution-plan", () => ({
  createExecutionPlan: (stageDefs: any[]) => {
    createExecutionPlanCallCount++;
    const stagesMap = new Map(
      stageDefs.map((s: any) => [s.id, { ...s, status: "pending" }]),
    );
    return {
      stages: stagesMap,
      markCompleted: () => {},
      markFailed: () => {},
      markRunning: () => {},
      ready: () => [],
      done: () => true,
    };
  },
  detectCycles: (_stages: any) => detectCyclesQueue.shift() ?? [],
}));

mock.module("../engine/prompt-for-approval", () => ({
  createApprovalRequest: () => {
    const result = approvalResultQueue.length > 0
      ? approvalResultQueue.shift()
      : { approved: true };
    return {
      promise: Promise.resolve(result),
      resolve: () => {},
    };
  },
}));

mock.module("../engine/executor", () => ({
  executePlan: async function* () {},
}));

mock.module("../engine/scribe-runner", () => ({
  createScribeRunner: () =>
    async function* (_ctx: any) {
      scribeCallCount++;
      for (const event of scribeEventQueue) {
        yield event;
      }
    },
}));

afterAll(() => { mock.restore(); });

// savePlan is injected via createOrchestrator({ savePlan }) — no mock.module needed.

// ── Import under test (after mocks are registered) ────────────────────────

const { createOrchestrator: _createOrchestrator } = await import("../engine/orchestrator");

/** Wraps the real factory with the mock savePlan injected. */
const mockSavePlan = async (opts: any) => {
  savePlanCalls.push(opts);
  return "/mocked/path/plan.md";
};
const createOrchestrator = () => _createOrchestrator({ savePlan: mockSavePlan });

// ── Helpers ────────────────────────────────────────────────────────────────

async function collectEvents(gen: AsyncGenerator<any>): Promise<any[]> {
  const events: any[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

/** Push a stage into plannerStructuredOutput so planning succeeds. */
function addStage(id: string, deps: string[] = []) {
  if (!plannerStructuredOutput) {
    plannerStructuredOutput = { summary: "test", stages: [], open_questions: [] };
  }
  plannerStructuredOutput.stages.push({
    id,
    plan: { objective: `plan for ${id}`, context: [], skills: [], targets: [], inScope: [], outScope: [], acs: [] },
    dependencies: deps,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("createOrchestrator \u2013 SessionEvent", () => {
  beforeEach(() => {
    plannerStructuredOutput = null;
    plannerResultSessionIds = [];
    plannerEventQueue = [];
    plannerSideEffects = [];
    plannerCallCount = 0;
    approvalResultQueue = [];
    scribeCallCount = 0;
    scribeEventQueue = [];
    savePlanCalls = [];
  });

  // ── Initial session event (resume) ──────────────────────────────────────

  describe("initial session event on resume", () => {
    test("emits { kind: 'session' } as the first event when context.sessionId is provided", async () => {
      const events = await collectEvents(
        createOrchestrator().run({
          prompt: "test prompt",
          sessionId: "resume-session-abc",
        }),
      );

      expect(events[0]).toEqual({
        kind: "session",
        sessionId: "resume-session-abc",
      });
    });

    test("does not emit an initial session event when context.sessionId is absent", async () => {
      const events = await collectEvents(
        createOrchestrator().run({ prompt: "test prompt" }),
      );

      expect(events[0]).toEqual({ kind: "phase_start", phase: "planning" });
    });
  });

  // ── Final session event \u2013 early return (no stages) ───────────────────────

  describe("final session event on early return (no stages produced)", () => {
    test("emits session event before early return when planner captured a session_id", async () => {
      // Deliver session_id via the auto-result event; no structured_output \u2192 early return.
      plannerResultSessionIds[0] = "planner-session-early";

      const events = await collectEvents(
        createOrchestrator().run({ prompt: "test prompt" }),
      );

      expect(events).toContainEqual({
        kind: "session",
        sessionId: "planner-session-early",
      });
    });

    test("does not emit a session event on early return when planner produced no session_id", async () => {
      // plannerResultSessionIds stays empty \u2192 session_id undefined \u2192 no session event
      const events = await collectEvents(
        createOrchestrator().run({ prompt: "test prompt" }),
      );

      const sessionEvents = events.filter((e) => e.kind === "session");
      expect(sessionEvents).toHaveLength(0);
    });
  });

  // ── Final session event \u2013 after full execution ───────────────────────────

  describe("final session event after execution completes", () => {
    test("emits session event as the last event after execution when planner captured a session_id", async () => {
      // Use sideEffect to add a stage (sets plannerStructuredOutput) and
      // deliver session_id via the auto-result event.
      plannerSideEffects[0] = () => addStage("some-stage");
      plannerResultSessionIds[0] = "planner-session-end";

      const events = await collectEvents(
        createOrchestrator().run({ prompt: "test prompt" }),
      );

      expect(events[events.length - 2]).toEqual({
        kind: "session",
        sessionId: "planner-session-end",
      });
    });

    test("does not emit a final session event after execution when planner produced no session_id", async () => {
      // Add a stage so execution runs, but provide no session_id.
      plannerSideEffects[0] = () => addStage("some-stage");
      // plannerResultSessionIds[0] stays undefined

      const events = await collectEvents(
        createOrchestrator().run({ prompt: "test prompt" }),
      );

      const sessionEvents = events.filter((e) => e.kind === "session");
      expect(sessionEvents).toHaveLength(0);
    });
  });

  // ── Implicit approval after feedback (planner confirms no changes) ────

  describe("implicit approval when planner produces no new stages after feedback", () => {
    test("proceeds to execution when planner re-runs with feedback but registers no new stages", async () => {
      // First invocation: planner produces a stage.
      plannerSideEffects[0] = () => addStage("some-stage");
      // Second invocation: sideEffect is null \u2192 plannerStructuredOutput reset to null
      // inside the mock \u2192 no stages \u2192 implicit approval.
      plannerSideEffects[1] = null;

      plannerResultSessionIds[0] = "session-feedback";

      // First approval: rejected with feedback. Second: never reached (auto-approved).
      approvalResultQueue = [
        { approved: false, feedback: "looks good, just confirming" },
      ];

      const events = await collectEvents(
        createOrchestrator().run({ prompt: "test prompt" }),
      );

      const phaseStarts = events
        .filter((e) => e.kind === "phase_start")
        .map((e) => e.phase);

      expect(phaseStarts).toContain("executing");
    });

    test("emits two planning phases before executing", async () => {
      plannerSideEffects[0] = () => addStage("some-stage");
      plannerSideEffects[1] = null;

      plannerResultSessionIds[0] = "session-feedback";

      approvalResultQueue = [
        { approved: false, feedback: "no changes needed" },
      ];

      const events = await collectEvents(
        createOrchestrator().run({ prompt: "test prompt" }),
      );

      const phases = events
        .filter((e) => e.kind === "phase_start" || e.kind === "phase_end")
        .map((e) => `${e.kind}:${e.phase}`);

      expect(phases).toEqual([
        "phase_start:planning",
        "phase_end:planning",
        "phase_start:planning",
        "phase_end:planning",
        "phase_start:executing",
        "phase_end:executing",
        "phase_start:scribing",
        "phase_end:scribing",
      ]);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe("createOrchestrator \u2013 Scribing phase", () => {
  beforeEach(() => {
    plannerStructuredOutput = null;
    plannerResultSessionIds = [];
    plannerEventQueue = [];
    plannerSideEffects = [];
    plannerCallCount = 0;
    approvalResultQueue = [];
    scribeCallCount = 0;
    scribeEventQueue = [];
    savePlanCalls = [];
  });

  // ── phase_start / phase_end events emitted ──────────────────────────

  test("emits phase_start:scribing and phase_end:scribing when execution completes with stages", async () => {
    plannerSideEffects[0] = () => addStage("stage-a");

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "build something" }),
    );

    expect(events).toContainEqual({ kind: "phase_start", phase: "scribing" });
    expect(events).toContainEqual({ kind: "phase_end", phase: "scribing" });
  });

  // ── Phase ordering ───────────────────────────────────────────────────────

  test("scribing phase appears AFTER phase_end:executing and BEFORE the final session event", async () => {
    plannerSideEffects[0] = () => addStage("stage-a");
    plannerResultSessionIds[0] = "session-order-check";

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "build something" }),
    );

    const idxPhaseEndExecuting = events.findIndex(
      (e) => e.kind === "phase_end" && e.phase === "executing",
    );
    const idxPhaseStartScribing = events.findIndex(
      (e) => e.kind === "phase_start" && e.phase === "scribing",
    );
    const idxPhaseEndScribing = events.findIndex(
      (e) => e.kind === "phase_end" && e.phase === "scribing",
    );
    const idxSession = events.findLastIndex((e) => e.kind === "session");

    expect(idxPhaseStartScribing).toBeGreaterThan(idxPhaseEndExecuting);
    expect(idxPhaseEndScribing).toBeGreaterThan(idxPhaseStartScribing);
    expect(idxSession).toBeGreaterThan(idxPhaseEndScribing);
  });

  // ── Phase sequence ───────────────────────────────────────────────────────

  test("phase sequence is planning \u2192 executing \u2192 scribing (single approval)", async () => {
    plannerSideEffects[0] = () => addStage("stage-a");

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "build something" }),
    );

    const phases = events
      .filter((e) => e.kind === "phase_start" || e.kind === "phase_end")
      .map((e) => `${e.kind}:${e.phase}`);

    expect(phases).toEqual([
      "phase_start:planning",
      "phase_end:planning",
      "phase_start:executing",
      "phase_end:executing",
      "phase_start:scribing",
      "phase_end:scribing",
    ]);
  });

  // ── Early-return path (no stages) ────────────────────────────────────────

  test("scribe is NOT invoked when no stages are produced (early-return path)", async () => {
    // plannerStructuredOutput stays null \u2192 orchestrator returns early
    await collectEvents(
      createOrchestrator().run({ prompt: "build something" }),
    );

    expect(scribeCallCount).toBe(0);
  });

  test("no scribing phase events are emitted on the early-return path", async () => {
    // plannerStructuredOutput stays null \u2192 orchestrator returns before execution/scribing

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "build something" }),
    );

    const scribingEvents = events.filter(
      (e) => (e.kind === "phase_start" || e.kind === "phase_end") && e.phase === "scribing",
    );
    expect(scribingEvents).toHaveLength(0);
  });

  // ── Agent events from scribe are forwarded ───────────────────────────────

  test("scribe agent events are wrapped and yielded with phase:'scribing'", async () => {
    plannerSideEffects[0] = () => addStage("stage-a");
    scribeEventQueue = [{ kind: "message", content: "Scribe output" }];

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "build something" }),
    );

    expect(events).toContainEqual({
      kind: "agent_event",
      phase: "scribing",
      event: { kind: "message", content: "Scribe output" },
    });
  });
});

// ── buildScribePrompt unit tests ──────────────────────────────────────────

const { buildScribePrompt, formatSessionReport, extractAgentStats } = await import("../engine/orchestrator");

describe("buildScribePrompt", () => {
  const mockPlan = {
    stages: new Map([
      [
        "stage-a",
        {
          id: "stage-a",
          plan: { objective: "Write tests", context: [], skills: [], targets: [], inScope: [], outScope: [], acs: [] },
          dependencies: [],
          status: "completed",
        },
      ],
      [
        "stage-b",
        {
          id: "stage-b",
          plan: { objective: "Write impl", context: [], skills: [], targets: [], inScope: [], outScope: [], acs: [] },
          dependencies: ["stage-a"],
          status: "failed",
        },
      ],
    ]),
  } as any;

  test("includes the original user prompt under '## Original Request'", () => {
    const result = buildScribePrompt("my request", mockPlan, "plan text");
    expect(result).toContain("## Original Request");
    expect(result).toContain("my request");
  });

  test("includes the rendered plan under '## Plan'", () => {
    const result = buildScribePrompt("req", mockPlan, "rendered plan text");
    expect(result).toContain("## Plan");
    expect(result).toContain("rendered plan text");
  });

  test("includes stage id, status, dependencies and plan text for each stage", () => {
    const result = buildScribePrompt("req", mockPlan, "plan text");
    expect(result).toContain("### Stage: stage-a");
    expect(result).toContain("**Status:** completed");
    expect(result).toContain("**Dependencies:** none");
    expect(result).toContain("Write tests");
    expect(result).toContain("### Stage: stage-b");
    expect(result).toContain("**Status:** failed");
    expect(result).toContain("**Dependencies:** stage-a");
    expect(result).toContain("Write impl");
  });

  test("ends with the standard scribe instruction", () => {
    const result = buildScribePrompt("req", mockPlan, "plan text");
    expect(result).toContain(
      "Please validate the implementation and write a memory file documenting this work.",
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe("createOrchestrator \u2013 Plan saving", () => {
  beforeEach(() => {
    plannerStructuredOutput = null;
    plannerResultSessionIds = [];
    plannerEventQueue = [];
    plannerSideEffects = [];
    plannerCallCount = 0;
    approvalResultQueue = [];
    scribeCallCount = 0;
    scribeEventQueue = [];
    savePlanCalls = [];
  });

  test("calls savePlan with rendered plan, prompt, and cwd after approval", async () => {
    plannerSideEffects[0] = () => addStage("stage-a");

    await collectEvents(
      createOrchestrator().run({ prompt: "my test prompt", cwd: "/some/cwd" }),
    );

    expect(savePlanCalls[0]).toMatchObject({
      renderedPlan: "Rendered Plan",
      prompt: "my test prompt",
      cwd: "/some/cwd",
    });
  });

  test("calls savePlan on implicit approval (feedback loop with no new stages)", async () => {
    // First invocation: planner produces stages
    plannerSideEffects[0] = () => addStage("stage-a");
    // Second invocation: planner produces nothing \u2192 implicit approval
    plannerSideEffects[1] = null;

    approvalResultQueue = [
      { approved: false, feedback: "looks good, confirming" },
    ];

    await collectEvents(
      createOrchestrator().run({ prompt: "my test prompt" }),
    );

    expect(savePlanCalls).toHaveLength(1);
  });

  test("does not call savePlan when no stages are produced (early return)", async () => {
    // plannerStructuredOutput stays null \u2192 orchestrator returns before saving
    await collectEvents(
      createOrchestrator().run({ prompt: "my test prompt" }),
    );

    expect(savePlanCalls).toHaveLength(0);
  });

  test("continues to execution even if savePlan rejects", async () => {
    plannerSideEffects[0] = () => addStage("stage-a");

    const failingOrchestrator = _createOrchestrator({
      savePlan: async () => { throw new Error("disk full"); },
    });

    const events = await collectEvents(
      failingOrchestrator.run({ prompt: "my test prompt" }),
    );

    expect(events).toContainEqual({ kind: "phase_start", phase: "executing" });
    expect(events).toContainEqual({ kind: "phase_start", phase: "scribing" });
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe("formatSessionReport", () => {
  test("contains the heading line", () => {
    const report = formatSessionReport({ wallClockMs: 0, totalAgentMs: 0, totalTurns: 0, totalCostUsd: 0 });
    expect(report).toContain("# ── Orchestrator ─ Session Statistics ──");
  });

  test("formats wall-clock time as hours, minutes and seconds", () => {
    // 3661000ms = 1h 1m 1s
    const report = formatSessionReport({ wallClockMs: 3661000, totalAgentMs: 0, totalTurns: 0, totalCostUsd: 0 });
    expect(report).toContain("1 hours, 1 minutes and 1 seconds");
  });

  test("formats agent time separately from wall-clock time", () => {
    // 7322000ms = 2h 2m 2s
    const report = formatSessionReport({ wallClockMs: 0, totalAgentMs: 7322000, totalTurns: 0, totalCostUsd: 0 });
    expect(report).toContain("2 hours, 2 minutes and 2 seconds");
  });

  test("formats total turns as bold number", () => {
    const report = formatSessionReport({ wallClockMs: 0, totalAgentMs: 0, totalTurns: 42, totalCostUsd: 0 });
    expect(report).toContain("**42 turns**");
  });

  test("formats cost as $X.XXXX USD bold", () => {
    const report = formatSessionReport({ wallClockMs: 0, totalAgentMs: 0, totalTurns: 0, totalCostUsd: 1.2345 });
    expect(report).toContain("**$1.2345 USD**");
  });

  test("formats zero cost as $0.0000 USD", () => {
    const report = formatSessionReport({ wallClockMs: 0, totalAgentMs: 0, totalTurns: 0, totalCostUsd: 0 });
    expect(report).toContain("**$0.0000 USD**");
  });

  test("correctly decomposes 3661000ms: 1h 1m 1s (not 0h 61m 1s)", () => {
    const report = formatSessionReport({ wallClockMs: 3661000, totalAgentMs: 0, totalTurns: 0, totalCostUsd: 0 });
    expect(report).not.toContain("0 hours, 61 minutes");
    expect(report).toContain("1 hours, 1 minutes and 1 seconds");
  });

  test("wall-clock section mentions 'The session completed in'", () => {
    const report = formatSessionReport({ wallClockMs: 1000, totalAgentMs: 0, totalTurns: 0, totalCostUsd: 0 });
    expect(report).toContain("The session completed in");
  });

  test("agent time section mentions 'total time spent by the agents'", () => {
    const report = formatSessionReport({ wallClockMs: 0, totalAgentMs: 1000, totalTurns: 0, totalCostUsd: 0 });
    expect(report).toContain("total time spent by the agents");
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe("extractAgentStats", () => {
  test("returns stats for agent_event wrapping a result event", () => {
    const event = {
      kind: "agent_event",
      phase: "planning",
      event: { kind: "result", text: "", duration_ms: 1000, cost_usd: 0.01, num_turns: 3, session_id: "abc" },
    };
    expect(extractAgentStats(event as any)).toEqual({ durationMs: 1000, costUsd: 0.01, numTurns: 3 });
  });

  test("returns stats for stage_agent_event wrapping a result event", () => {
    const event = {
      kind: "stage_agent_event",
      stageId: "stage-1",
      event: { kind: "result", text: "", duration_ms: 2000, cost_usd: 0.05, num_turns: 5, session_id: "def" },
    };
    expect(extractAgentStats(event as any)).toEqual({ durationMs: 2000, costUsd: 0.05, numTurns: 5 });
  });

  test("returns null for agent_event with a non-result (message) event", () => {
    const event = { kind: "agent_event", phase: "planning", event: { kind: "message", content: "hello" } };
    expect(extractAgentStats(event as any)).toBeNull();
  });

  test("returns null for agent_event with a tool_use event", () => {
    const event = { kind: "agent_event", phase: "planning", event: { kind: "tool_use", id: "x", tool: "t", input: {} } };
    expect(extractAgentStats(event as any)).toBeNull();
  });

  test("returns null for stage_agent_event with a non-result event", () => {
    const event = { kind: "stage_agent_event", stageId: "s", event: { kind: "message", content: "hi" } };
    expect(extractAgentStats(event as any)).toBeNull();
  });

  test("returns null for phase_start event", () => {
    const event = { kind: "phase_start", phase: "planning" };
    expect(extractAgentStats(event as any)).toBeNull();
  });

  test("returns null for session event", () => {
    const event = { kind: "session", sessionId: "abc" };
    expect(extractAgentStats(event as any)).toBeNull();
  });

  test("returns null for stage_start event", () => {
    const event = { kind: "stage_start", stageId: "s" };
    expect(extractAgentStats(event as any)).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe("createOrchestrator – Session Stats", () => {
  beforeEach(() => {
    plannerStructuredOutput = null;
    plannerResultSessionIds = [];
    plannerEventQueue = [];
    plannerSideEffects = [];
    plannerCallCount = 0;
    approvalResultQueue = [];
    scribeCallCount = 0;
    scribeEventQueue = [];
    savePlanCalls = [];
  });

  test("emits a session_stats event as the very last event", async () => {
    plannerSideEffects[0] = () => addStage("stage-a");

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "build something" }),
    );

    expect(events[events.length - 1].kind).toBe("session_stats");
  });

  test("emits session_stats as the last event even on early return (no stages)", async () => {
    // plannerStructuredOutput stays null → early return path
    const events = await collectEvents(
      createOrchestrator().run({ prompt: "build something" }),
    );

    expect(events[events.length - 1].kind).toBe("session_stats");
  });

  test("session_stats wallClockMs is a non-negative number", async () => {
    plannerSideEffects[0] = () => addStage("stage-a");

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "build something" }),
    );

    const statsEvent = events[events.length - 1];
    expect(typeof statsEvent.stats.wallClockMs).toBe("number");
    expect(statsEvent.stats.wallClockMs).toBeGreaterThanOrEqual(0);
  });

  test("session_stats accumulates totalAgentMs and totalTurns from planner result event", async () => {
    plannerSideEffects[0] = () => addStage("stage-a");
    // Mock planner always emits: { duration_ms: 100, cost_usd: 0, num_turns: 1 }

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "build something" }),
    );

    const statsEvent = events[events.length - 1];
    expect(statsEvent.stats.totalAgentMs).toBe(100);
    expect(statsEvent.stats.totalTurns).toBe(1);
    expect(statsEvent.stats.totalCostUsd).toBe(0);
  });

  test("session_stats accumulates from both planner and scribe result events", async () => {
    plannerSideEffects[0] = () => addStage("stage-a");
    scribeEventQueue = [{
      kind: "result",
      text: "done",
      duration_ms: 200,
      cost_usd: 0.05,
      num_turns: 2,
      session_id: "scribe-session",
    }];

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "build something" }),
    );

    const statsEvent = events[events.length - 1];
    // planner: 100ms + 1 turn + $0; scribe: 200ms + 2 turns + $0.05
    expect(statsEvent.stats.totalAgentMs).toBe(300);
    expect(statsEvent.stats.totalTurns).toBe(3);
    expect(statsEvent.stats.totalCostUsd).toBe(0.05);
  });

  test("session_stats is emitted after the final session event when sessionId is present", async () => {
    plannerSideEffects[0] = () => addStage("stage-a");
    plannerResultSessionIds[0] = "session-xyz";

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "build something" }),
    );

    const idxSession = events.findLastIndex((e: any) => e.kind === "session");
    const idxStats = events.findLastIndex((e: any) => e.kind === "session_stats");
    expect(idxStats).toBeGreaterThan(idxSession);
  });
});

describe("createOrchestrator \u2013 Cycle Detection", () => {
  beforeEach(() => {
    plannerStructuredOutput = null;
    plannerResultSessionIds = [];
    plannerEventQueue = [];
    plannerSideEffects = [];
    plannerCallCount = 0;
    plannerCapturedParams = [];
    approvalResultQueue = [];
    scribeCallCount = 0;
    scribeEventQueue = [];
    savePlanCalls = [];
    detectCyclesQueue = [];
    createExecutionPlanCallCount = 0;
  });

  test("yields cycle_detected event when planner output contains cycles", async () => {
    plannerSideEffects[0] = () => addStage("a", ["b"]);
    detectCyclesQueue = [[["a", "b", "a"]]];
    plannerSideEffects[1] = null; // second call: no stages → early return

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "test" }),
    );

    const cycleEvent = events.find((e: any) => e.kind === "cycle_detected");
    expect(cycleEvent).toBeDefined();
  });

  test("cycle_detected event contains renderedPlan from renderCyclicPlan and cycle paths", async () => {
    const cycles = [["a", "b", "a"]];
    detectCyclesQueue = [cycles];
    plannerSideEffects[0] = () => addStage("a", ["b"]);
    plannerSideEffects[1] = null;

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "test" }),
    );

    const cycleEvent = events.find((e: any) => e.kind === "cycle_detected");
    expect(cycleEvent).toEqual({
      kind: "cycle_detected",
      renderedPlan: "Cyclic Plan Render",
      cycles,
    });
  });

  test("does not yield plan_approval_request when cycles are detected", async () => {
    detectCyclesQueue = [[["a", "b", "a"]]];
    plannerSideEffects[0] = () => addStage("a", ["b"]);
    plannerSideEffects[1] = null;

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "test" }),
    );

    const approvalEvents = events.filter((e: any) => e.kind === "plan_approval_request");
    expect(approvalEvents).toHaveLength(0);
  });

  test("does not call createExecutionPlan when cycles are detected", async () => {
    detectCyclesQueue = [[["a", "b", "a"]]];
    plannerSideEffects[0] = () => addStage("a", ["b"]);
    plannerSideEffects[1] = null;

    await collectEvents(
      createOrchestrator().run({ prompt: "test" }),
    );

    expect(createExecutionPlanCallCount).toBe(0);
  });

  test("re-invokes the planner after cycle detection", async () => {
    detectCyclesQueue = [[["a", "b", "a"]]];
    plannerSideEffects[0] = () => addStage("a", ["b"]);
    plannerSideEffects[1] = null;

    await collectEvents(
      createOrchestrator().run({ prompt: "test" }),
    );

    expect(plannerCallCount).toBe(2);
  });

  test("second planner invocation receives feedback describing detected cycles", async () => {
    detectCyclesQueue = [[["a", "b", "a"]]];
    plannerSideEffects[0] = () => addStage("a", ["b"]);
    plannerSideEffects[1] = null;

    await collectEvents(
      createOrchestrator().run({ prompt: "test" }),
    );

    expect(plannerCapturedParams[1]?.prompt).toContain("a depends on b which depends on a");
  });

  test("cyclic first plan then valid second plan proceeds to plan approval", async () => {
    detectCyclesQueue = [[["a", "b", "a"]]]; // first call returns cycles
    plannerSideEffects[0] = () => addStage("a", ["b"]);
    plannerSideEffects[1] = () => addStage("c"); // second call: valid plan (detectCycles defaults to [])

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "test" }),
    );

    const approvalEvents = events.filter((e: any) => e.kind === "plan_approval_request");
    expect(approvalEvents).toHaveLength(1);
  });

  test("phase sequence: two planning phases then executing when cycle then valid plan", async () => {
    detectCyclesQueue = [[["a", "b", "a"]]];
    plannerSideEffects[0] = () => addStage("a", ["b"]);
    plannerSideEffects[1] = () => addStage("c");

    const events = await collectEvents(
      createOrchestrator().run({ prompt: "test" }),
    );

    const phases = events
      .filter((e: any) => e.kind === "phase_start" || e.kind === "phase_end")
      .map((e: any) => `${e.kind}:${e.phase}`);

    expect(phases).toEqual([
      "phase_start:planning",
      "phase_end:planning",
      "phase_start:planning",
      "phase_end:planning",
      "phase_start:executing",
      "phase_end:executing",
      "phase_start:scribing",
      "phase_end:scribing",
    ]);
  });
});
