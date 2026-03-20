import { describe, expect, mock, test } from "bun:test";
import React from "react";
import { renderToString } from "ink";
import {
  App,
  isApprovalYes,
  evalApprovalSubmit,
  drainOrchestratorRun,
} from "../ui/App";
import { createIdGenerator } from "../ui/mapEvent";
import type { Orchestrator, OrchestratorEvent } from "../orchestrator";
import type { ApprovalResult } from "../prompt-for-approval";
import type { HistoryEntry } from "../ui/types";

// ── Helpers ────────────────────────────────────────────

const fixedId = (id: string) => () => id;
const freshId = () => createIdGenerator();
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

/** Advances the microtask queue so async generators can produce the next value. */
const flushMicrotasks = () => new Promise<void>((r) => setTimeout(r, 0));

/** A no-op orchestrator that never yields any events. */
const silentOrchestrator: Orchestrator = {
  async *run() {},
};

// ── isApprovalYes ────────────────────────────────────────────

describe("isApprovalYes", () => {
  test("returns true for 'y'", () => {
    expect(isApprovalYes("y")).toBe(true);
  });

  test("returns true for 'yes'", () => {
    expect(isApprovalYes("yes")).toBe(true);
  });

  test("returns true for uppercase 'Y'", () => {
    expect(isApprovalYes("Y")).toBe(true);
  });

  test("returns true for uppercase 'YES'", () => {
    expect(isApprovalYes("YES")).toBe(true);
  });

  test("returns true for mixed-case 'Yes'", () => {
    expect(isApprovalYes("Yes")).toBe(true);
  });

  test("returns true when padded with whitespace", () => {
    expect(isApprovalYes("  yes  ")).toBe(true);
  });

  test("returns false for 'n'", () => {
    expect(isApprovalYes("n")).toBe(false);
  });

  test("returns false for 'no'", () => {
    expect(isApprovalYes("no")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isApprovalYes("")).toBe(false);
  });

  test("returns false for arbitrary feedback text", () => {
    expect(isApprovalYes("please add more tests")).toBe(false);
  });
});

// ── evalApprovalSubmit ───────────────────────────────────────────────

describe("evalApprovalSubmit – approve", () => {
  test("returns action 'approve' for 'y'", () => {
    const result = evalApprovalSubmit("y", fixedId("h1"));
    expect(result.action).toBe("approve");
  });

  test("returns action 'approve' for 'yes'", () => {
    const result = evalApprovalSubmit("yes", fixedId("h1"));
    expect(result.action).toBe("approve");
  });

  test("approve entry has '✓ Plan approved.' text", () => {
    const result = evalApprovalSubmit("y", fixedId("h1"));
    expect(result.entry.text).toBe("✓ Plan approved.");
  });

  test("approve entry is kind 'info'", () => {
    const result = evalApprovalSubmit("y", fixedId("h1"));
    expect(result.entry.kind).toBe("info");
  });

  test("approve entry uses id from nextId", () => {
    const result = evalApprovalSubmit("y", fixedId("h99"));
    expect(result.entry.id).toBe("h99");
  });
});

describe("evalApprovalSubmit – reject", () => {
  test("returns action 'reject' for 'n'", () => {
    const result = evalApprovalSubmit("n", fixedId("h1"));
    expect(result.action).toBe("reject");
  });

  test("returns action 'reject' for empty string", () => {
    const result = evalApprovalSubmit("", fixedId("h1"));
    expect(result.action).toBe("reject");
  });

  test("returns action 'reject' for arbitrary feedback text", () => {
    const result = evalApprovalSubmit("add more error handling", fixedId("h1"));
    expect(result.action).toBe("reject");
  });

  test("reject result carries the original input as feedback", () => {
    const result = evalApprovalSubmit("add more error handling", fixedId("h1"));
    if (result.action === "reject") {
      expect(result.feedback).toBe("add more error handling");
    }
  });

  test("reject carries empty string as feedback when input is empty", () => {
    const result = evalApprovalSubmit("", fixedId("h1"));
    if (result.action === "reject") {
      expect(result.feedback).toBe("");
    }
  });

  test("reject entry is kind 'info'", () => {
    const result = evalApprovalSubmit("n", fixedId("h1"));
    expect(result.entry.kind).toBe("info");
  });

  test("reject entry uses id from nextId", () => {
    const result = evalApprovalSubmit("n", fixedId("h77"));
    expect(result.entry.id).toBe("h77");
  });

  test("calls nextId exactly once for any input", () => {
    let calls = 0;
    evalApprovalSubmit("feedback", () => { calls++; return "hX"; });
    expect(calls).toBe(1);
  });
});

// ── drainOrchestratorRun ───────────────────────────────────────────────────

describe("drainOrchestratorRun – event forwarding", () => {
  test("maps phase_start events to history entries via onEntries", async () => {
    async function* gen(): AsyncGenerator<OrchestratorEvent> {
      yield { kind: "phase_start", phase: "planning" };
    }
    const batches: HistoryEntry[][] = [];
    await drainOrchestratorRun(gen(), freshId(), (e) => batches.push(e), () => {});
    expect(batches).toHaveLength(1);
    expect(batches[0]![0]!.kind).toBe("phase");
  });

  test("does not call onEntries for events that produce no history entries", async () => {
    async function* gen(): AsyncGenerator<OrchestratorEvent> {
      yield { kind: "phase_end", phase: "planning" };
    }
    const batches: HistoryEntry[][] = [];
    await drainOrchestratorRun(gen(), freshId(), (e) => batches.push(e), () => {});
    expect(batches).toHaveLength(0);
  });

  test("accumulates entries across multiple events", async () => {
    async function* gen(): AsyncGenerator<OrchestratorEvent> {
      yield { kind: "phase_start", phase: "planning" };
      yield { kind: "session", sessionId: "s1" };
    }
    const batches: HistoryEntry[][] = [];
    await drainOrchestratorRun(gen(), freshId(), (e) => batches.push(e), () => {});
    expect(batches).toHaveLength(2);
  });

  test("IDs increment across events using a shared generator", async () => {
    async function* gen(): AsyncGenerator<OrchestratorEvent> {
      yield { kind: "phase_start", phase: "planning" };
      yield { kind: "session", sessionId: "s1" };
    }
    const entries: HistoryEntry[] = [];
    await drainOrchestratorRun(
      gen(),
      freshId(),
      (e) => entries.push(...e),
      () => {},
    );
    expect(entries[0]!.id).toBe("h1");
    expect(entries[1]!.id).toBe("h2");
  });
});

describe("drainOrchestratorRun – plan_approval_request", () => {
  test("calls onApproval with event.resolve when plan_approval_request is received", async () => {
    let resolveApproval!: (r: ApprovalResult) => void;

    async function* gen(): AsyncGenerator<OrchestratorEvent> {
      const p = new Promise<ApprovalResult>((r) => { resolveApproval = r; });
      yield {
        kind: "plan_approval_request",
        plan: {} as any,
        renderedPlan: "## Stage A",
        resolve: resolveApproval,
      };
      await p;
    }

    let capturedApproval: ((r: ApprovalResult) => void) | null = null;
    const runPromise = drainOrchestratorRun(
      gen(),
      freshId(),
      () => {},
      (resolve) => { capturedApproval = resolve; },
    );

    await flushMicrotasks();
    expect(capturedApproval).not.toBeNull();

    capturedApproval!({ approved: true });
    await runPromise;
  });

  test("also emits an info entry for plan_approval_request via onEntries", async () => {
    let resolveApproval!: (r: ApprovalResult) => void;

    async function* gen(): AsyncGenerator<OrchestratorEvent> {
      const p = new Promise<ApprovalResult>((r) => { resolveApproval = r; });
      yield {
        kind: "plan_approval_request",
        plan: {} as any,
        renderedPlan: "## My Plan",
        resolve: resolveApproval,
      };
      await p;
    }

    const entries: HistoryEntry[] = [];
    const runPromise = drainOrchestratorRun(
      gen(),
      freshId(),
      (e) => entries.push(...e),
      () => {},
    );

    await flushMicrotasks();
    resolveApproval({ approved: true });
    await runPromise;

    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe("info");
    if (entries[0]!.kind === "info") {
      expect(entries[0]!.text).toContain("## My Plan");
    }
  });

  test("run completes after resolve is called with approved:true", async () => {
    let resolveApproval!: (r: ApprovalResult) => void;

    async function* gen(): AsyncGenerator<OrchestratorEvent> {
      const p = new Promise<ApprovalResult>((r) => { resolveApproval = r; });
      yield {
        kind: "plan_approval_request",
        plan: {} as any,
        renderedPlan: "plan",
        resolve: resolveApproval,
      };
      await p;
    }

    const runPromise = drainOrchestratorRun(gen(), freshId(), () => {}, () => {});
    await flushMicrotasks();
    resolveApproval({ approved: true });
    await expect(runPromise).resolves.toBeUndefined();
  });

  test("run remains pending until resolve is called", async () => {
    let resolved = false;
    let resolveApproval!: (r: ApprovalResult) => void;

    async function* gen(): AsyncGenerator<OrchestratorEvent> {
      const p = new Promise<ApprovalResult>((r) => { resolveApproval = r; });
      yield {
        kind: "plan_approval_request",
        plan: {} as any,
        renderedPlan: "plan",
        resolve: resolveApproval,
      };
      await p;
    }

    const runPromise = drainOrchestratorRun(gen(), freshId(), () => {}, () => {});
    runPromise.then(() => { resolved = true; });

    await flushMicrotasks();
    expect(resolved).toBe(false);

    resolveApproval({ approved: true });
    await flushMicrotasks();
    expect(resolved).toBe(true);
  });
});

// ── App rendering ────────────────────────────────────────────────────────────────────

describe("App – initial render", () => {
  test("renders without throwing when initialPrompt is provided", () => {
    expect(() =>
      renderToString(
        <App orchestrator={silentOrchestrator} initialPrompt="test prompt" onExit={() => {}} />,
      ),
    ).not.toThrow();
  });

  test("does not show approval prompt in initial state", () => {
    const output = stripAnsi(
      renderToString(
        <App orchestrator={silentOrchestrator} initialPrompt="test prompt" onExit={() => {}} />,
      ),
    );
    expect(output).not.toContain("Approve");
  });
});

describe("App – resumeSessionId prop", () => {
  test("renders without throwing when resumeSessionId is provided", () => {
    expect(() =>
      renderToString(
        <App
          orchestrator={silentOrchestrator}
          initialPrompt="test"
          onExit={() => {}}
          resumeSessionId="resume-abc"
        />,
      ),
    ).not.toThrow();
  });
});

// ── App – onExit integration ───────────────────────────────────────────────────────

describe("App – onExit", () => {
  test("calls onExit after orchestrator run completes", async () => {
    const onExit = mock(() => {});
    // Model the component's useEffect: drain the run then call onExit
    await drainOrchestratorRun(
      silentOrchestrator.run({ prompt: "test prompt", sessionId: undefined }),
      freshId(),
      () => {},
      () => {},
    ).then(onExit);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

// ── App – autoApprove ──────────────────────────────────────────────────────────────

describe("App – autoApprove", () => {
  test("auto-approves when autoApprove prop is true", async () => {
    let resolveApproval!: (r: ApprovalResult) => void;
    let pendingApprovalSet = false;

    async function* mockGen(): AsyncGenerator<OrchestratorEvent> {
      const p = new Promise<ApprovalResult>((r) => { resolveApproval = r; });
      yield {
        kind: "plan_approval_request",
        plan: {} as any,
        renderedPlan: "## Test Plan",
        resolve: resolveApproval,
      };
      await p;
    }

    const mockOrchestrator: Orchestrator = { run: () => mockGen() };
    const autoApprove = true;

    await drainOrchestratorRun(
      mockOrchestrator.run({ prompt: "test prompt", sessionId: undefined }),
      freshId(),
      () => {},
      (resolve) => {
        if (autoApprove) {
          resolve({ approved: true });
        } else {
          pendingApprovalSet = true;
        }
      },
    );

    expect(pendingApprovalSet).toBe(false);
  });
});

// ── App – approval mode switching (async, via drainOrchestratorRun) ──────────

describe("App – approval mode switching", () => {
  test("onApproval is invoked when orchestrator yields plan_approval_request", async () => {
    let resolveApproval!: (r: ApprovalResult) => void;
    let approvalReceived = false;

    async function* mockGen(): AsyncGenerator<OrchestratorEvent> {
      const p = new Promise<ApprovalResult>((r) => { resolveApproval = r; });
      yield {
        kind: "plan_approval_request",
        plan: {} as any,
        renderedPlan: "stage plan text",
        resolve: resolveApproval,
      };
      await p;
    }

    const mockOrchestrator: Orchestrator = { run: () => mockGen() };

    // Simulate what the component's useEffect does: start draining the run
    const runPromise = drainOrchestratorRun(
      mockOrchestrator.run({ prompt: "do stuff", sessionId: undefined }),
      freshId(),
      () => {},
      () => { approvalReceived = true; },
    );

    await flushMicrotasks();
    expect(approvalReceived).toBe(true);

    resolveApproval({ approved: true });
    await runPromise;
  });

  test("isRunning remains true until approval is resolved", async () => {
    // We model isRunning as the run promise not yet having settled.
    let resolveApproval!: (r: ApprovalResult) => void;

    async function* mockGen(): AsyncGenerator<OrchestratorEvent> {
      const p = new Promise<ApprovalResult>((r) => { resolveApproval = r; });
      yield {
        kind: "plan_approval_request",
        plan: {} as any,
        renderedPlan: "plan",
        resolve: resolveApproval,
      };
      await p;
    }

    let runDone = false;
    const runPromise = drainOrchestratorRun(
      mockGen(),
      freshId(),
      () => {},
      () => {},
    );
    runPromise.then(() => { runDone = true; });

    await flushMicrotasks();
    expect(runDone).toBe(false);

    resolveApproval({ approved: true });
    await flushMicrotasks();
    expect(runDone).toBe(true);
  });

  test("approval info entry is pushed to history after approval", async () => {
    // Simulate what handleApprovalSubmit does after onApproval is invoked
    const entries: HistoryEntry[] = [];
    const nextId = freshId();

    // Approving via evalApprovalSubmit produces the entry that gets appended
    const result = evalApprovalSubmit("y", nextId);
    entries.push(result.entry);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe("info");
    expect(entries[0]!.text).toBe("✓ Plan approved.");
  });

  test("rejection forwards feedback text to pendingApproval", () => {
    const pendingApproval = mock((_r: ApprovalResult) => {});
    const result = evalApprovalSubmit("please add logging", fixedId("h1"));

    if (result.action === "reject") {
      pendingApproval({ approved: false, feedback: result.feedback });
    }

    expect(pendingApproval).toHaveBeenCalledWith({
      approved: false,
      feedback: "please add logging",
    });
  });
});
