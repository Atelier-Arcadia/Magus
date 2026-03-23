import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock createAgent to capture the config it receives
const createAgentMock = mock((config: any) => config);
mock.module("../agents/common", () => ({
  createAgent: createAgentMock,
}));

// Import after mocking so the mock is in effect
const { createScribe } = await import("../agents/scribe");

describe("createScribe", () => {
  beforeEach(() => {
    createAgentMock.mockClear();
  });

  test("calls createAgent exactly once", () => {
    const queue = { push: mock() } as any;
    createScribe(queue);
    expect(createAgentMock).toHaveBeenCalledTimes(1);
  });

  test("passes model claude-sonnet-4-6 via options", () => {
    const queue = { push: mock() } as any;
    createScribe(queue);
    const config = createAgentMock.mock.calls[0][0];
    expect(config.options).toEqual({ model: "claude-opus-4-6" });
  });

  test("passes read-only tools array to createAgent", () => {
    const queue = { push: mock() } as any;
    createScribe(queue);
    const config = createAgentMock.mock.calls[0][0];
    expect(config.tools).toEqual(["Read", "Glob", "Grep"]);
  });

  test("passes a non-empty systemPrompt string", () => {
    const queue = { push: mock() } as any;
    createScribe(queue);
    const config = createAgentMock.mock.calls[0][0];
    expect(config.systemPrompt).toBeString();
    expect(config.systemPrompt.length).toBeGreaterThan(0);
  });

  test("includes exactly three mcpTools", () => {
    const queue = { push: mock() } as any;
    createScribe(queue);
    const config = createAgentMock.mock.calls[0][0];
    expect(config.mcpTools).toBeArrayOfSize(3);
  });

  test("includes a Date mcp tool", () => {
    const queue = { push: mock() } as any;
    createScribe(queue);
    const config = createAgentMock.mock.calls[0][0];
    const names = config.mcpTools.map((t: any) => t.name);
    expect(names).toContain("Date");
  });

  test("includes a CreateFile mcp tool", () => {
    const queue = { push: mock() } as any;
    createScribe(queue);
    const config = createAgentMock.mock.calls[0][0];
    const names = config.mcpTools.map((t: any) => t.name);
    expect(names).toContain("CreateFile");
  });
});

