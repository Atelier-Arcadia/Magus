import { describe, expect, test } from "bun:test";
import { buildStagePrompt } from "../executor";
import { createExecutionPlan, type StagePlan } from "../execution-plan";
import { createMessageQueue } from "../message-queue";

const queue = () => createMessageQueue();

/** Build a minimal StagePlan with only an objective set. */
function makePlan(objective: string): StagePlan {
  return { objective, context: [], skills: [], targets: [], inScope: [], outScope: [], acs: [] };
}

describe("buildStagePrompt", () => {
  test("root stage with no dependencies returns formatted stage markdown", () => {
    const plan = createExecutionPlan([
      { id: "a", plan: makePlan("Build the widget"), queue: queue() },
    ]);

    const result = buildStagePrompt(plan.stages.get("a")!, plan);

    expect(result).toBe("# Stage: a\n\nBuild the widget");
  });

  test("stage with one completed parent includes parent context", () => {
    const plan = createExecutionPlan([
      { id: "a", plan: makePlan("Build the widget"), queue: queue() },
      { id: "b", plan: makePlan("Use the widget"), queue: queue(), dependencies: ["a"] },
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
      { id: "a", plan: makePlan("Build module A"), queue: queue() },
      { id: "b", plan: makePlan("Build module B"), queue: queue() },
      {
        id: "c",
        plan: makePlan("Integrate A and B"),
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
      { id: "a", plan: makePlan("Build it"), queue: queue() },
      { id: "b", plan: makePlan("Use it"), queue: queue(), dependencies: ["a"] },
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
      { id: "a", plan: makePlan("Build it"), queue: queue() },
      { id: "b", plan: makePlan("Use it"), queue: queue(), dependencies: ["a"] },
    ]);

    plan.markRunning("a");
    plan.markCompleted("a", "");

    const result = buildStagePrompt(plan.stages.get("b")!, plan);

    // Even with empty result, the context section is present
    expect(result).toContain("## Context from Completed Dependencies");
    expect(result).toContain("### a");
  });
});
