import { describe, expect, test } from "bun:test";
import { extractSummary, extractFilesToModify, renderPlanDetails } from "../render-plan";
import { createExecutionPlan } from "../execution-plan";
import { createMessageQueue } from "../message-queue";

const queue = () => createMessageQueue();

// ── extractSummary ──────────────────────────────────────────────────────────

describe("extractSummary", () => {
  test("extracts text between stage header and first ## section", () => {
    const plan = `# Stage: add-widget

Build a widget component for the dashboard.

## Context

Files to modify:
* src/widget.ts - new file`;

    expect(extractSummary(plan)).toBe(
      "Build a widget component for the dashboard.",
    );
  });

  test("returns full text when there is no ## section", () => {
    expect(extractSummary("Just do the thing")).toBe("Just do the thing");
  });

  test("strips the stage header line", () => {
    const plan = `# Stage: foo

The summary.`;
    expect(extractSummary(plan)).toBe("The summary.");
  });
});

// ── extractFilesToModify ────────────────────────────────────────────────────

describe("extractFilesToModify", () => {
  test("extracts bullet list after 'Files to modify:' marker", () => {
    const plan = `## Context

Files to modify:
* src/a.ts - add widget
* src/b.ts - update types

## Scope`;

    expect(extractFilesToModify(plan)).toBe(
      "* src/a.ts - add widget\n* src/b.ts - update types",
    );
  });

  test("returns empty string when marker is missing", () => {
    expect(extractFilesToModify("No files section here")).toBe("");
  });

  test("handles dash-style bullets", () => {
    const plan = `Files to modify:
- src/x.ts - thing`;

    expect(extractFilesToModify(plan)).toBe("- src/x.ts - thing");
  });
});

// ── renderPlanDetails ───────────────────────────────────────────────────────

describe("renderPlanDetails", () => {
  test("renders stage id, summary, and files to modify", () => {
    const plan = createExecutionPlan([
      {
        id: "add-widget",
        plan: `# Stage: add-widget

Build the widget.

## Context

Files to modify:
* src/widget.ts - new component

## Scope

In scope: widget`,
        queue: queue(),
      },
    ]);

    const result = renderPlanDetails(plan);

    expect(result).toContain("### add-widget");
    expect(result).toContain("Build the widget.");
    expect(result).toContain("* src/widget.ts - new component");
  });

  test("renders without files section when none listed", () => {
    const plan = createExecutionPlan([
      { id: "simple", plan: "Just a summary", queue: queue() },
    ]);

    const result = renderPlanDetails(plan);

    expect(result).toContain("### simple");
    expect(result).toContain("Just a summary");
    expect(result).not.toContain("Files to modify:");
  });

  test("separates multiple stages with ---", () => {
    const plan = createExecutionPlan([
      { id: "a", plan: "Do A", queue: queue() },
      { id: "b", plan: "Do B", queue: queue() },
    ]);

    const result = renderPlanDetails(plan);

    expect(result).toContain("---");
    expect(result).toContain("### a");
    expect(result).toContain("### b");
  });

  test("verbose=false is the same as the default (summary mode)", () => {
    const plan = createExecutionPlan([
      {
        id: "stage-x",
        plan: `# Stage: stage-x

The summary text.

## Context

Files to modify:
* src/x.ts - modify this`,
        queue: queue(),
      },
    ]);

    expect(renderPlanDetails(plan, false)).toBe(renderPlanDetails(plan));
  });

  test("verbose=true renders the full plan text instead of a summary", () => {
    const fullPlan = `# Stage: full-detail

The summary.

## Context

Files to modify:
* src/z.ts - change it

## Scope

In scope: everything`;

    const plan = createExecutionPlan([
      { id: "full-detail", plan: fullPlan, queue: queue() },
    ]);

    const result = renderPlanDetails(plan, true);

    expect(result).toContain("### full-detail");
    // Full plan text must be present, not just the extracted summary
    expect(result).toContain("## Context");
    expect(result).toContain("## Scope");
    expect(result).toContain("In scope: everything");
  });

  test("verbose=true includes Dependencies line when stage has dependencies", () => {
    const plan = createExecutionPlan([
      { id: "alpha", plan: "Alpha plan", queue: queue() },
      {
        id: "beta",
        plan: "Beta plan",
        queue: queue(),
        dependencies: ["alpha"],
      },
    ]);

    const result = renderPlanDetails(plan, true);

    expect(result).toContain("Dependencies: alpha");
  });

  test("verbose=true omits Dependencies line when stage has no dependencies", () => {
    const plan = createExecutionPlan([
      { id: "solo", plan: "Solo plan", queue: queue() },
    ]);

    const result = renderPlanDetails(plan, true);

    expect(result).not.toContain("Dependencies:");
  });

  test("verbose=true separates stages with ---", () => {
    const plan = createExecutionPlan([
      { id: "one", plan: "Plan one", queue: queue() },
      { id: "two", plan: "Plan two", queue: queue() },
    ]);

    const result = renderPlanDetails(plan, true);

    expect(result).toContain("---");
    expect(result).toContain("### one");
    expect(result).toContain("### two");
  });
});
