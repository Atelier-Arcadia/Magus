import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

// ── Shared mock state ───────────────────────────────────────────────────────

/** Answer emitted by the fake TTY stream (trimEnd is applied by promptUser). */
let mockAnswer = "y";

/** HistoryEntry[] returned by the mock mapOrchestratorEvent for each call. */
let mockEntries: { kind: string }[] = [];

// ── Module mocks ────────────────────────────────────────────────────────────
// mock.module() calls are hoisted before any imports by Bun's test runner.

mock.module("node:fs", () => ({
  createReadStream: () => {
    const stream = {
      once(event: string, handler: (chunk: string) => void) {
        if (event === "data") setTimeout(() => handler(mockAnswer + "\n"), 0);
        return stream;
      },
      destroy() {},
    };
    return stream;
  },
}));

mock.module("../ui/mapEvent", () => ({
  createIdGenerator: () => () => "test-id",
  mapOrchestratorEvent: (_event: unknown, _nextId: unknown, _verbose: unknown) => mockEntries,
}));

mock.module("../ui/format-entry", () => ({
  formatEntry: (entry: { kind: string }) => `[${entry.kind}]`,
}));

mock.module("../ui/ansi", () => ({
  RESET: "<RESET>",
  DIM: "<DIM>",
  CYAN: "<CYAN>",
  GRAY: "<GRAY>",
}));

import { drainEvents, promptUser } from "../code-helpers";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function* emitEvents(events: object[]) {
  for (const event of events) yield event as any;
}

const noopId = () => "id-0";

// ── promptUser ───────────────────────────────────────────────────────────────

describe("promptUser", () => {
  test("writes the question to stdout", async () => {
    const writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
    mockAnswer = "y";
    await promptUser("Question: ");
    expect(writeSpy).toHaveBeenCalledWith("Question: ");
    writeSpy.mockRestore();
  });

  test("resolves with the trimmed (trimEnd) answer from the TTY stream", async () => {
    spyOn(process.stdout, "write").mockImplementation(() => true);
    mockAnswer = "hello";
    const result = await promptUser("Q: ");
    expect(result).toBe("hello");
  });

  test("strips the trailing newline emitted by the stream", async () => {
    spyOn(process.stdout, "write").mockImplementation(() => true);
    mockAnswer = "some answer";
    const result = await promptUser("Q: ");
    expect(result).toBe("some answer");
  });
});

// ── drainEvents ──────────────────────────────────────────────────────────────

describe("drainEvents", () => {
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockEntries = [];
    mockAnswer = "y";
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy?.mockRestore();
  });

  test("completes without error when the generator is empty", async () => {
    await expect(drainEvents(emitEvents([]), noopId, false, false, false)).resolves.toBeUndefined();
  });

  test("logs a formatted entry for each HistoryEntry returned by mapOrchestratorEvent", async () => {
    mockEntries = [{ kind: "assistant_message" }];
    await drainEvents(emitEvents([{ kind: "phase_start", phase: "planning" }]), noopId, false, false, false);
    expect(logSpy).toHaveBeenCalledWith("[assistant_message]");
  });

  test("does not log anything when mapOrchestratorEvent returns no entries", async () => {
    mockEntries = [];
    await drainEvents(emitEvents([{ kind: "phase_end", phase: "planning" }]), noopId, false, false, false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  test("skips tool_use entries when hideTools is true", async () => {
    mockEntries = [{ kind: "tool_use" }];
    await drainEvents(emitEvents([{ kind: "agent_event" }]), noopId, false, true, false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  test("skips tool_error entries when hideTools is true", async () => {
    mockEntries = [{ kind: "tool_error" }];
    await drainEvents(emitEvents([{ kind: "agent_event" }]), noopId, false, true, false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  test("logs tool_use entries when hideTools is false", async () => {
    mockEntries = [{ kind: "tool_use" }];
    await drainEvents(emitEvents([{ kind: "agent_event" }]), noopId, false, false, false);
    expect(logSpy).toHaveBeenCalledWith("[tool_use]");
  });

  test("auto-approves plan_approval_request and logs confirmation when autoApprove is true", async () => {
    const resolveMock = mock(() => {});
    const event = { kind: "plan_approval_request", resolve: resolveMock, plan: {}, renderedPlan: "" };
    await drainEvents(emitEvents([event]), noopId, true, false, false);
    expect(resolveMock).toHaveBeenCalledWith({ approved: true });
    expect(logSpy).toHaveBeenCalled();
  });

  test("approves plan when user enters 'y'", async () => {
    const resolveMock = mock(() => {});
    const event = { kind: "plan_approval_request", resolve: resolveMock, plan: {}, renderedPlan: "" };
    mockAnswer = "y";
    await drainEvents(emitEvents([event]), noopId, false, false, false);
    expect(resolveMock).toHaveBeenCalledWith({ approved: true });
  });

  test("approves plan when user enters 'yes'", async () => {
    const resolveMock = mock(() => {});
    const event = { kind: "plan_approval_request", resolve: resolveMock, plan: {}, renderedPlan: "" };
    mockAnswer = "yes";
    await drainEvents(emitEvents([event]), noopId, false, false, false);
    expect(resolveMock).toHaveBeenCalledWith({ approved: true });
  });

  test("rejects plan with feedback when user enters anything other than y/yes", async () => {
    const resolveMock = mock(() => {});
    const event = { kind: "plan_approval_request", resolve: resolveMock, plan: {}, renderedPlan: "" };
    mockAnswer = "no, please add a test step";
    await drainEvents(emitEvents([event]), noopId, false, false, false);
    expect(resolveMock).toHaveBeenCalledWith({ approved: false, feedback: "no, please add a test step" });
  });
});
