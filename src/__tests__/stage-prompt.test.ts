import { describe, expect, test } from "bun:test";
import { buildStagePrompt, formatStagePlan } from "../stage-prompt";
import { createExecutionPlan, type StagePlan } from "../execution-plan";
import { createMessageQueue } from "../message-queue";

const queue = () => createMessageQueue();

/** Build a minimal StagePlan with only an objective set. */
function makePlan(objective: string): StagePlan {
  return { objective, context: [], skills: [], targets: [], inScope: [], outScope: [], acs: [] };
}

// ── formatStagePlan ───────────────────────────────────────────────────────────

describe("formatStagePlan", () => {
  test("minimal plan renders only the stage heading and objective", () => {
    const plan = makePlan("Build the widget");
    expect(formatStagePlan("my-stage", plan)).toBe("# Stage: my-stage\n\nBuild the widget");
  });

  test("plan with context files renders a Context section with inspect bullets", () => {
    const plan: StagePlan = {
      ...makePlan("Do something"),
      context: ["src/foo.ts", "src/bar.ts"],
    };
    const result = formatStagePlan("ctx-stage", plan);
    expect(result).toContain("## Context");
    expect(result).toContain("Files to inspect:");
    expect(result).toContain("* src/foo.ts");
    expect(result).toContain("* src/bar.ts");
  });

  test("plan with skills renders a Context section with Skills bullets", () => {
    const plan: StagePlan = {
      ...makePlan("Do something"),
      skills: ["skills/typescript.md"],
    };
    const result = formatStagePlan("skill-stage", plan);
    expect(result).toContain("## Context");
    expect(result).toContain("Skills:");
    expect(result).toContain("* skills/typescript.md");
  });

  test("plan with target files renders a Context section with modify bullets", () => {
    const plan: StagePlan = {
      ...makePlan("Do something"),
      targets: ["src/output.ts"],
    };
    const result = formatStagePlan("target-stage", plan);
    expect(result).toContain("## Context");
    expect(result).toContain("Files to modify:");
    expect(result).toContain("* src/output.ts");
  });

  test("plan with inScope items renders a Scope section with dash bullets", () => {
    const plan: StagePlan = {
      ...makePlan("Do something"),
      inScope: ["Add new feature", "Update tests"],
    };
    const result = formatStagePlan("scope-stage", plan);
    expect(result).toContain("## Scope");
    expect(result).toContain("In scope:");
    expect(result).toContain("- Add new feature");
    expect(result).toContain("- Update tests");
  });

  test("plan with outScope items renders an Out of scope subsection", () => {
    const plan: StagePlan = {
      ...makePlan("Do something"),
      outScope: ["Modify unrelated files"],
    };
    const result = formatStagePlan("scope-stage", plan);
    expect(result).toContain("## Scope");
    expect(result).toContain("Out of scope:");
    expect(result).toContain("- Modify unrelated files");
  });

  test("plan with acceptance criteria renders a checkbox list under Acceptance Criteria", () => {
    const plan: StagePlan = {
      ...makePlan("Do something"),
      acs: ["All tests pass", "Types are exported"],
    };
    const result = formatStagePlan("ac-stage", plan);
    expect(result).toContain("## Acceptance Criteria");
    expect(result).toContain("This work is only considered done when:");
    expect(result).toContain("* [ ] All tests pass");
    expect(result).toContain("* [ ] Types are exported");
  });

  test("full plan with all fields renders all sections in order", () => {
    const plan: StagePlan = {
      objective: "Full plan objective",
      context: ["src/a.ts"],
      skills: ["skills/fp.md"],
      targets: ["src/b.ts"],
      inScope: ["Do this"],
      outScope: ["Not that"],
      acs: ["Works correctly"],
    };
    const result = formatStagePlan("full-stage", plan);

    const contextIdx = result.indexOf("## Context");
    const scopeIdx = result.indexOf("## Scope");
    const acIdx = result.indexOf("## Acceptance Criteria");

    expect(result).toContain("# Stage: full-stage");
    expect(result).toContain("Full plan objective");
    expect(contextIdx).toBeGreaterThan(-1);
    expect(scopeIdx).toBeGreaterThan(contextIdx);
    expect(acIdx).toBeGreaterThan(scopeIdx);
  });

  test("omits Context section when context, skills, and targets are all empty", () => {
    const plan = makePlan("Objective only");
    const result = formatStagePlan("empty-ctx", plan);
    expect(result).not.toContain("## Context");
  });

  test("omits Scope section when inScope and outScope are both empty", () => {
    const plan = makePlan("Objective only");
    const result = formatStagePlan("empty-scope", plan);
    expect(result).not.toContain("## Scope");
  });

  test("omits Acceptance Criteria section when acs is empty", () => {
    const plan = makePlan("Objective only");
    const result = formatStagePlan("empty-ac", plan);
    expect(result).not.toContain("## Acceptance Criteria");
  });
});

// ── buildStagePrompt ──────────────────────────────────────────────────────────

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
