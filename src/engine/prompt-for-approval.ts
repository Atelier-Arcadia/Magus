// ── Approval result ────────────────────────────────────────────────────────────────────────

/**
 * The user's response to a plan approval prompt.
 *
 * - `approved: true`  → the orchestrator should proceed to execution.
 * - `approved: false` → the user wants to continue refining the plan.
 *   `feedback` contains their follow-up message for the planner.
 */
export type ApprovalResult =
  | { approved: true }
  | { approved: false; feedback: string };

// ── Approval request ────────────────────────────────────────────────────────────────────────

/**
 * A deferred promise that bridges the orchestrator and the UI layer.
 *
 * The orchestrator yields an event containing the `resolve` function, then
 * awaits `promise`. The consumer (CLI, web UI, etc.) displays the plan,
 * collects the user's decision, and calls `resolve` with the result.
 */
export type ApprovalRequest = {
  /** Resolves the pending approval with the user's decision. */
  resolve(result: ApprovalResult): void;

  /** The promise the orchestrator awaits while the user decides. */
  promise: Promise<ApprovalResult>;
};

/**
 * Create a new deferred approval request.
 *
 * Usage (orchestrator side):
 * ```ts
 * const request = createApprovalRequest();
 * yield { kind: "plan_approval_request", ..., resolve: request.resolve };
 * const result = await request.promise;
 * ```
 *
 * Usage (consumer side):
 * ```ts
 * case "plan_approval_request":
 *   // display the plan, ask the user
 *   event.resolve({ approved: true });
 *   // or: event.resolve({ approved: false, feedback: userInput });
 * ```
 */
export function createApprovalRequest(): ApprovalRequest {
  let resolve!: (result: ApprovalResult) => void;
  const promise = new Promise<ApprovalResult>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}

