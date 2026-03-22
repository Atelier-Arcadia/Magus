import { describe, expect, test } from "bun:test";
import { buildStagePrompt } from "../executor";
import { createExecutionPlan } from "../execution-plan";
import { createMessageQueue } from "../message-queue";

const queue = () => createMessageQueue();

describe("buildStagePrompt", () => {
  test("root stage with no dependencies returns plan unchanged", () => {
    const plan = createExecutionPlan([
      { id: "a", plan: "Build the widget", queue: queue() },
    ]);

    const result = buildStagePrompt(plan.stages.get("a")!, plan);

    expect(result).toBe("Build the widget");
  });

  test("stage with one completed parent includes parent context", () => {
    const plan = createExecutionPlan([
      { id: "a", plan: "Build the widget", queue: queue() },
      { id: "b", plan: "Use the widget", queue: queue(), dependencies: ["a"] },
    ]);

    plan.markRunning("a");
    plan.markCompleted("a", "Created widget.ts with Widget class");

    const result = buildStagePrompt(plan.stages.get("b")!, plan);

    expect(result).toContain("## Context from Completed Dependencies");
    expect(result).toContain("### a");
    expect(result).toContain("Created widget.ts with Widget class");
    expect(result).toContain("Use the widget");
  });

  test("stage with multiple parents includes all parent results", () => {
    const plan = createExecutionPlan([
      { id: "a", plan: "Build module A", queue: queue() },
      { id: "b", plan: "Build module B", queue: queue() },
      {
        id: "c",
        plan: "Integrate A and B",
        queue: queue(),
        dependencies: ["a", "b"],
      },
    ]);

    plan.markRunning("a");
    plan.markCompleted("a", "Module A result");
    plan.markRunning("b");
    plan.markCompleted("b", "Module B result");

    const result = buildStagePrompt(plan.stages.get("c")!, plan);

    expect(result).toContain("### a\nModule A result");
    expect(result).toContain("### b\nModule B result");
    expect(result).toContain("Integrate A and B");
  });

  test("context section appears before the stage plan separated by ---", () => {
    const plan = createExecutionPlan([
      { id: "a", plan: "Build it", queue: queue() },
      { id: "b", plan: "Use it", queue: queue(), dependencies: ["a"] },
    ]);

    plan.markRunning("a");
    plan.markCompleted("a", "Built it");

    const result = buildStagePrompt(plan.stages.get("b")!, plan);

    const separatorIndex = result.indexOf("---");
    const planIndex = result.indexOf("Use it");
    expect(separatorIndex).toBeGreaterThan(-1);
    expect(planIndex).toBeGreaterThan(separatorIndex);
  });

  test("includes fallback result text when parent has empty result", () => {
    const plan = createExecutionPlan([
      { id: "a", plan: "Build it", queue: queue() },
      { id: "b", plan: "Use it", queue: queue(), dependencies: ["a"] },
    ]);

    plan.markRunning("a");
    plan.markCompleted("a", "");

    const result = buildStagePrompt(plan.stages.get("b")!, plan);

    // Even with empty result, the context section is present
    expect(result).toContain("## Context from Completed Dependencies");
    expect(result).toContain("### a");
  });
});
