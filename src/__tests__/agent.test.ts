import { describe, expect, test } from "bun:test";
import { mapSdkMessage } from "../agent";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSuccessMessage(overrides: Partial<Record<string, unknown>> = {}): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    result: "done",
    duration_ms: 100,
    duration_api_ms: 80,
    is_error: false,
    num_turns: 2,
    stop_reason: null,
    total_cost_usd: 0.001,
    usage: {} as any,
    modelUsage: {},
    permission_denials: [],
    uuid: "test-uuid" as any,
    session_id: "s1",
    ...overrides,
  } as SDKMessage;
}

// ── mapSdkMessage – result success ──────────────────────────────────────────────

describe("mapSdkMessage – result success / structured_output", () => {
  test("forwards structured_output when present", () => {
    const msg = makeSuccessMessage({ structured_output: { plan: ["step1"] } });
    const events = [...mapSdkMessage(msg)];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "result", structured_output: { plan: ["step1"] } });
  });

  test("structured_output is undefined when absent from the SDK message", () => {
    const msg = makeSuccessMessage();
    const events = [...mapSdkMessage(msg)];
    expect(events).toHaveLength(1);
    expect((events[0] as any).structured_output).toBeUndefined();
  });
});

