import { describe, expect, test, mock } from "bun:test";
import { createMessageQueue } from "../message-queue";
import { createStageSink } from "../tools/plan-stage";

// Capture the config passed to createAgent by mocking the module
const createAgentMock = mock((config: any) => config);
mock.module("../agent", () => ({
  createAgent: createAgentMock,
}));

// Import after mocking so the mock is in effect
const { createPlanner } = await import("../agents/planner");

describe("createPlanner", () => {
  test("passes options with model claude-opus-4-6 to createAgent", () => {
    const queue = createMessageQueue();
    const sink = createStageSink();

    createPlanner(queue, sink);

    expect(createAgentMock).toHaveBeenCalledTimes(1);
    const config = createAgentMock.mock.calls[0][0];
    expect(config.options).toEqual({ model: "claude-opus-4-6" });
  });

  test("includes systemPrompt, tools, and mcpTools in config", () => {
    const queue = createMessageQueue();
    const sink = createStageSink();

    createAgentMock.mockClear();
    createPlanner(queue, sink);

    const config = createAgentMock.mock.calls[0][0];
    expect(config.systemPrompt).toBeString();
    expect(config.tools).toEqual(["Read", "Glob", "Grep"]);
    expect(config.mcpTools).toBeArrayOfSize(1);
  });
});

