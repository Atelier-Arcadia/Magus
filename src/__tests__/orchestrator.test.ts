import { beforeEach, describe, expect, mock, test } from "bun:test";


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

// ── Module mocks ───────────────────────────────────────────────────────────

mock.module("../engine/message-queue", () => ({
  createMessageQueue: () => ({}),
}));

mock.module("../agents/planner", () => ({
  createPlanner: () =>
    async function* (_ctx: any) {
      const idx = plannerCallCount++;
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

mock.module("../engine/render-plan", () => ({
  renderExecutionPlan: () => "Rendered Plan",
}));

mock.module("../engine/execution-plan", () => ({
  createExecutionPlan: (stageDefs: any[]) => {
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

      expect(events[events.length - 1]).toEqual({
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

const { buildScribePrompt } = await import("../engine/orchestrator");

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
