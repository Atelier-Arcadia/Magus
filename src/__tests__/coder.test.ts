import { describe, expect, test, mock } from "bun:test";

// Mock createAgent to capture the config it receives
const createAgentMock = mock(() => "mocked-agent" as any);
mock.module("../agent", () => ({
  createAgent: createAgentMock,
}));

// Import after mocking
const { createCoder } = await import("../agents/coder");

describe("createCoder", () => {
  test("passes default model claude-sonnet-4-6 via options", () => {
    const queue = { push: mock() } as any;
    createCoder(queue);

    expect(createAgentMock).toHaveBeenCalledTimes(1);
    const config = createAgentMock.mock.calls[0][0];
    expect(config.options).toEqual({ model: "claude-sonnet-4-6" });
  });
});

