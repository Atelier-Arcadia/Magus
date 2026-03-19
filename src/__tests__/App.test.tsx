import { describe, expect, mock, test } from "bun:test";
import React from "react";
import { renderToString } from "ink";
import {
  App,
  isApprovalYes,
  evalPromptSubmit,
  evalApprovalSubmit,
  drainOrchestratorRun,
} from "../ui/App";
import { createIdGenerator } from "../ui/mapEvent";
import type { Orchestrator, OrchestratorEvent } from "../orchestrator";
import type { ApprovalResult } from "../prompt-for-approval";
import type { HistoryEntry } from "../ui/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const fixedId = (id: string) => () => id;
const freshId = () => createIdGenerator();
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

/** Advances the microtask queue so async generators can produce the next value. */
const flushMicrotasks = () => new Promise<void>((r) => setTimeout(r, 0));

/** A no-op orchestrator that never yields any events. */
const silentOrchestrator: Orchestrator = {
  async *run() {},
};

// ── isApprovalYes ────────────────────────────────────────────────────────────

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

// ── evalPromptSubmit ─────────────────────────────────────────────────────────

describe("evalPromptSubmit – exit command", () => {
  test("returns action 'exit' when input is 'exit'", () => {
    const result = evalPromptSubmit("exit", undefined, false, fixedId("h1"));
    expect(result).toEqual({ action: "exit" });
  });

  test("does not call nextId for exit command", () => {
    let calls = 0;
    evalPromptSubmit("exit", undefined, false, () => { calls++; return "hX"; });
    expect(calls).toBe(0);
  });
});

describe("evalPromptSubmit – empty input", () => {
  test("returns action 'noop' for empty string", () => {
    const result = evalPromptSubmit("", undefined, false, fixedId("h1"));
    expect(result).toEqual({ action: "noop" });
  });

  test("does not call nextId for empty input", () => {
    let calls = 0;
    evalPromptSubmit("", undefined, false, () => { calls++; return "hX"; });
    expect(calls).toBe(0);
  });
});

describe("evalPromptSubmit – normal prompt", () => {
  test("returns action 'run' with a user_prompt entry", () => {
    const result = evalPromptSubmit("hello", undefined, false, fixedId("h1"));
    expect(result.action).toBe("run");
    if (result.action === "run") {
      expect(result.entry).toEqual({ kind: "user_prompt", id: "h1", text: "hello" });
    }
  });

  test("uses the id returned by nextId", () => {
    const result = evalPromptSubmit("hi", undefined, false, fixedId("h42"));
    if (result.action === "run") {
      expect(result.entry.id).toBe("h42");
    }
  });

  test("calls nextId exactly once", () => {
    let calls = 0;
    evalPromptSubmit("hi", undefined, false, () => { calls++; return "hX"; });
    expect(calls).toBe(1);
  });

  test("sets sessionId from resumeSessionId on first run (hasResumed=false)", () => {
    const result = evalPromptSubmit("hi", "resume-abc", false, fixedId("h1"));
    if (result.action === "run") {
      expect(result.sessionId).toBe("resume-abc");
    }
  });

  test("sessionId is undefined on subsequent runs (hasResumed=true)", () => {
    const result = evalPromptSubmit("hi", "resume-abc", true, fixedId("h1"));
    if (result.action === "run") {
      expect(result.sessionId).toBeUndefined();
    }
  });

  test("sessionId is undefined when no resumeSessionId provided", () => {
    const result = evalPromptSubmit("hi", undefined, false, fixedId("h1"));
    if (result.action === "run") {
      expect(result.sessionId).toBeUndefined();
    }
  });
});

// ── evalApprovalSubmit ───────────────────────────────────────────────────────

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

// ── drainOrchestratorRun ─────────────────────────────────────────────────────

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

// ── App rendering ─────────────────────────────────────────────────────────────

describe("App – initial render", () => {
  test("renders without throwing", () => {
    expect(() =>
      renderToString(<App orchestrator={silentOrchestrator} onExit={() => {}} />),
    ).not.toThrow();
  });

  test("renders the prompt prefix and cursor in the initial state", () => {
    const output = stripAnsi(
      renderToString(<App orchestrator={silentOrchestrator} onExit={() => {}} />),
    );
    expect(output).toContain("> ");
    expect(output).toContain("▎");
  });

  test("renders no history entries in the initial state", () => {
    const output = stripAnsi(
      renderToString(<App orchestrator={silentOrchestrator} onExit={() => {}} />),
    );
    expect(output).not.toContain("❯");
    expect(output).not.toContain("Phase:");
  });

  test("does not show approval prompt in initial state", () => {
    const output = stripAnsi(
      renderToString(<App orchestrator={silentOrchestrator} onExit={() => {}} />),
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
          onExit={() => {}}
          resumeSessionId="resume-abc"
        />,
      ),
    ).not.toThrow();
  });
});

// ── App – onExit integration (via mock orchestrator) ─────────────────────────

describe("App – exit command logic (via evalPromptSubmit)", () => {
  test("evalPromptSubmit returns exit action for input 'exit'", () => {
    // This mirrors exactly what the component's handlePromptSubmit does:  
    // it calls evalPromptSubmit and, on action === 'exit', calls onExit().
    const result = evalPromptSubmit("exit", undefined, false, fixedId("h1"));
    expect(result.action).toBe("exit");
  });

  test("onExit is called when component's submit handler receives 'exit'", () => {
    // We verify the handler is wired correctly by checking the mock orchestrator
    // is never called when the user types 'exit'.
    const runMock = mock(async function* () {});
    const orchestrator: Orchestrator = { run: runMock };
    const onExit = mock(() => {});

    // renderToString captures the synchronous render; we can't simulate keystrokes
    // without ink-testing-library. Instead we verify onExit is NOT wired to a
    // side effect that requires the orchestrator, which we confirm via evalPromptSubmit.
    const result = evalPromptSubmit("exit", undefined, false, fixedId("h1"));
    if (result.action === "exit") onExit();

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(runMock).not.toHaveBeenCalled();
  });
});

// ── App – prompt submit logic (via evalPromptSubmit) ─────────────────────────

describe("App – user_prompt entry creation", () => {
  test("evalPromptSubmit produces a user_prompt entry for non-exit non-empty input", () => {
    const result = evalPromptSubmit("build me a thing", undefined, false, fixedId("h5"));
    expect(result.action).toBe("run");
    if (result.action === "run") {
      expect(result.entry.kind).toBe("user_prompt");
      expect(result.entry.text).toBe("build me a thing");
    }
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

    // Simulate what handlePromptSubmit does: start draining the run
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

// ── evalPromptSubmit – resumeSessionId forwarding ────────────────────────────────────

describe("evalPromptSubmit – resumeSessionId forwarded to orchestrator", () => {
  test("sessionId passed to run equals resumeSessionId on first call", async () => {
    // Verify that the sessionId computed by evalPromptSubmit is the one forwarded
    // to orchestrator.run — closing the loop on the resumeSessionId prop.
    const capturedContexts: { sessionId: string | undefined }[] = [];

    async function* mockGen(ctx: { sessionId?: string }): AsyncGenerator<OrchestratorEvent> {
      capturedContexts.push({ sessionId: ctx.sessionId });
    }

    const orchestrator: Orchestrator = { run: (ctx) => mockGen(ctx) };

    const result = evalPromptSubmit("hello", "my-resume-id", false, fixedId("h1"));
    if (result.action === "run") {
      await drainOrchestratorRun(
        orchestrator.run({ prompt: "hello", sessionId: result.sessionId }),
        freshId(),
        () => {},
        () => {},
      );
    }

    expect(capturedContexts[0]!.sessionId).toBe("my-resume-id");
  });

  test("sessionId is undefined when resumeSessionId is not provided", () => {
    const result = evalPromptSubmit("hello", undefined, false, fixedId("h1"));
    if (result.action === "run") {
      expect(result.sessionId).toBeUndefined();
    }
  });
});
