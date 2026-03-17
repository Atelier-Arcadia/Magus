import { beforeEach, describe, expect, mock, test } from "bun:test";


// ── Shared mock state ──────────────────────────────────────────────────────

/**
 * The sink returned by createStageSink(). We mutate its .stages array in
 * tests to control whether the orchestrator takes the early-return path or
 * the full execution path.
 */
const mockSink = { stages: [] as any[] };

/** Events the mock planner will yield when iterated. */
let plannerEventQueue: any[] = [];

/**
 * Optional side-effect run at the START of the mock planner's body (before
 * any yields). Use this to push items into mockSink.stages after the
 * orchestrator has already zeroed it out.
 */
let plannerSideEffect: (() => void) | null = null;

// ── Module mocks ───────────────────────────────────────────────────────────

mock.module("../tools/plan-stage", () => ({
  createStageSink: () => mockSink,
}));

mock.module("../message-queue", () => ({
  createMessageQueue: () => ({}),
}));

mock.module("../agents/planner", () => ({
  createPlanner: () =>
    async function* (_ctx: any) {
      plannerSideEffect?.();
      for (const event of plannerEventQueue) {
        yield event;
      }
    },
}));

mock.module("../render-plan", () => ({
  renderExecutionPlan: () => "Rendered Plan",
}));

mock.module("../execution-plan", () => ({
  createExecutionPlan: (stages: any[]) => ({
    stages,
    markCompleted: () => {},
    markFailed: () => {},
    markRunning: () => {},
    ready: () => [],
    done: () => true,
  }),
}));

mock.module("../prompt-for-approval", () => ({
  createApprovalRequest: () => ({
    promise: Promise.resolve({ approved: true }),
    resolve: () => {},
  }),
}));

mock.module("../executor", () => ({
  executePlan: async function* () {},
}));

// ── Import under test (after mocks are registered) ────────────────────────

const { createOrchestrator } = await import("../orchestrator");

// ── Helpers ────────────────────────────────────────────────────────────────

async function collectEvents(gen: AsyncGenerator<any>): Promise<any[]> {
  const events: any[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("createOrchestrator – SessionEvent", () => {
  beforeEach(() => {
    mockSink.stages = [];
    plannerEventQueue = [];
    plannerSideEffect = null;
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

  // ── Final session event – early return (no stages) ───────────────────────

  describe("final session event on early return (no stages produced)", () => {
    test("emits session event before early return when planner captured a session_id", async () => {
      plannerEventQueue = [
        {
          kind: "result",
          text: "",
          duration_ms: 100,
          cost_usd: 0,
          num_turns: 1,
          session_id: "planner-session-early",
        },
      ];

      const events = await collectEvents(
        createOrchestrator().run({ prompt: "test prompt" }),
      );

      expect(events).toContainEqual({
        kind: "session",
        sessionId: "planner-session-early",
      });
    });

    test("does not emit a session event on early return when planner produced no session_id", async () => {
      // plannerEventQueue stays empty → no result/error event → no session_id captured
      const events = await collectEvents(
        createOrchestrator().run({ prompt: "test prompt" }),
      );

      const sessionEvents = events.filter((e) => e.kind === "session");
      expect(sessionEvents).toHaveLength(0);
    });
  });

  // ── Final session event – after full execution ───────────────────────────

  describe("final session event after execution completes", () => {
    test("emits session event as the last event after execution when planner captured a session_id", async () => {
      // Push a stage so the orchestrator proceeds to execution
      plannerSideEffect = () => {
        mockSink.stages.push({
          id: "some-stage",
          plan: "do something",
          dependencies: [],
          queue: {},
          systemPrompt: "",
          tools: [],
        });
      };
      plannerEventQueue = [
        {
          kind: "result",
          text: "",
          duration_ms: 100,
          cost_usd: 0,
          num_turns: 1,
          session_id: "planner-session-end",
        },
      ];

      const events = await collectEvents(
        createOrchestrator().run({ prompt: "test prompt" }),
      );

      expect(events[events.length - 1]).toEqual({
        kind: "session",
        sessionId: "planner-session-end",
      });
    });

    test("does not emit a final session event after execution when planner produced no session_id", async () => {
      plannerSideEffect = () => {
        mockSink.stages.push({
          id: "some-stage",
          plan: "do something",
          dependencies: [],
          queue: {},
          systemPrompt: "",
          tools: [],
        });
      };
      // plannerEventQueue stays empty → no session_id captured

      const events = await collectEvents(
        createOrchestrator().run({ prompt: "test prompt" }),
      );

      const sessionEvents = events.filter((e) => e.kind === "session");
      expect(sessionEvents).toHaveLength(0);
    });
  });
});
