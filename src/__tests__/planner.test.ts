import { describe, expect, test, mock } from "bun:test";

// Capture the config passed to createAgent by mocking the module
const createAgentMock = mock((config: any) => config);
mock.module("../agent", () => ({
  createAgent: createAgentMock,
}));

// Import after mocking so the mock is in effect
const { createPlanner } = await import("../agents/planner");

describe("createPlanner", () => {
  test("calls createPlanner with no arguments", () => {
    createAgentMock.mockClear();
    createPlanner();
    expect(createAgentMock).toHaveBeenCalledTimes(1);
  });

  test("passes model claude-opus-4-6 in options", () => {
    createAgentMock.mockClear();
    createPlanner();
    const config = createAgentMock.mock.calls[0][0];
    expect(config.options.model).toBe("claude-opus-4-6");
  });

  test("passes tools [Read, Glob, Grep] and no mcpTools", () => {
    createAgentMock.mockClear();
    createPlanner();
    const config = createAgentMock.mock.calls[0][0];
    expect(config.tools).toEqual(["Read", "Glob", "Grep"]);
    expect(config.mcpTools).toBeUndefined();
  });

  test("includes a non-empty systemPrompt string", () => {
    createAgentMock.mockClear();
    createPlanner();
    const config = createAgentMock.mock.calls[0][0];
    expect(config.systemPrompt).toBeString();
    expect(config.systemPrompt.length).toBeGreaterThan(0);
  });

  test("outputFormat has type json_schema", () => {
    createAgentMock.mockClear();
    createPlanner();
    const config = createAgentMock.mock.calls[0][0];
    expect(config.options.outputFormat).toBeDefined();
    expect(config.options.outputFormat.type).toBe("json_schema");
  });

  test("outputFormat schema has required top-level properties summary, stages, open_questions", () => {
    createAgentMock.mockClear();
    createPlanner();
    const config = createAgentMock.mock.calls[0][0];
    const { schema } = config.options.outputFormat;
    expect(schema.properties).toHaveProperty("summary");
    expect(schema.properties).toHaveProperty("stages");
    expect(schema.properties).toHaveProperty("open_questions");
    expect(schema.required).toContain("summary");
    expect(schema.required).toContain("stages");
    expect(schema.required).toContain("open_questions");
  });

  test("outputFormat schema stages items have id, plan, dependencies properties", () => {
    createAgentMock.mockClear();
    createPlanner();
    const config = createAgentMock.mock.calls[0][0];
    const stageItems = config.options.outputFormat.schema.properties.stages.items;
    expect(stageItems.properties).toHaveProperty("id");
    expect(stageItems.properties).toHaveProperty("plan");
    expect(stageItems.properties).toHaveProperty("dependencies");
    expect(stageItems.required).toContain("id");
    expect(stageItems.required).toContain("plan");
    expect(stageItems.required).toContain("dependencies");
  });

  test("plan property in stage schema is an object type with all 7 StagePlan fields", () => {
    createAgentMock.mockClear();
    createPlanner();
    const config = createAgentMock.mock.calls[0][0];
    const stageItems = config.options.outputFormat.schema.properties.stages.items;
    const planSchema = stageItems.properties.plan;
    expect(planSchema.type).toBe("object");
    expect(planSchema.properties).toHaveProperty("objective");
    expect(planSchema.properties).toHaveProperty("context");
    expect(planSchema.properties).toHaveProperty("skills");
    expect(planSchema.properties).toHaveProperty("targets");
    expect(planSchema.properties).toHaveProperty("inScope");
    expect(planSchema.properties).toHaveProperty("outScope");
    expect(planSchema.properties).toHaveProperty("acs");
    expect(planSchema.required).toContain("objective");
    expect(planSchema.required).toContain("context");
    expect(planSchema.required).toContain("skills");
    expect(planSchema.required).toContain("targets");
    expect(planSchema.required).toContain("inScope");
    expect(planSchema.required).toContain("outScope");
    expect(planSchema.required).toContain("acs");
  });
});
