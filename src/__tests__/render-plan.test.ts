import { describe, expect, test } from "bun:test";
import { extractSummary, extractFilesToModify, renderPlanDetails } from "../engine/render-plan";
import { createExecutionPlan, type StagePlan } from "../engine/execution-plan";
import { createMessageQueue } from "../engine/message-queue";

const queue = () => createMessageQueue();

/** Build a minimal StagePlan with only an objective set. */
function makePlan(objective: string): StagePlan {
  return { objective, context: [], skills: [], targets: [], inScope: [], outScope: [], acs: [] };
}

// ── extractSummary ──────────────────────────────────────────────────────────

describe("extractSummary", () => {
  test("returns the objective field of a StagePlan", () => {
    const plan = makePlan("Build a widget component for the dashboard.");
    expect(extractSummary(plan)).toBe("Build a widget component for the dashboard.");
  });

  test("returns the objective when all other fields are empty", () => {
    const plan = makePlan("Just do the thing");
    expect(extractSummary(plan)).toBe("Just do the thing");
  });

  test("returns only the objective even when other StagePlan fields have values", () => {
    const plan: StagePlan = {
      objective: "The summary.",
      context: ["src/foo.ts"],
      skills: [".magus/skills/tdd.md"],
      targets: ["src/bar.ts"],
      inScope: ["add widget"],
      outScope: ["change styles"],
      acs: ["widget renders correctly"],
    };
    expect(extractSummary(plan)).toBe("The summary.");
  });
});

// ── extractFilesToModify ────────────────────────────────────────────────────

describe("extractFilesToModify", () => {
  test("formats targets as dash-prefixed bullet list", () => {
    const plan: StagePlan = {
      ...makePlan("some objective"),
      targets: ["src/a.ts", "src/b.ts"],
    };
    expect(extractFilesToModify(plan)).toBe("- src/a.ts\n- src/b.ts");
  });

  test("returns empty string when targets is empty", () => {
    expect(extractFilesToModify(makePlan("no files"))).toBe("");
  });

  test("returns a single dash-prefixed line for a single target", () => {
    const plan: StagePlan = { ...makePlan("single"), targets: ["src/x.ts"] };
    expect(extractFilesToModify(plan)).toBe("- src/x.ts");
  });
});

// ── renderPlanDetails ───────────────────────────────────────────────────────

describe("renderPlanDetails", () => {
  test("renders stage id, summary, and files to modify", () => {
    const plan = createExecutionPlan([
      {
        id: "add-widget",
        plan: {
          objective: "Build the widget.",
          context: [],
          skills: [],
          targets: ["src/widget.ts"],
          inScope: [],
          outScope: [],
          acs: [],
        },
        queue: queue(),
      },
    ]);

    const result = renderPlanDetails(plan);

    expect(result).toContain("### add-widget");
    expect(result).toContain("Build the widget.");
    expect(result).toContain("- src/widget.ts");
  });

  test("renders without files section when none listed", () => {
    const plan = createExecutionPlan([
      { id: "simple", plan: makePlan("Just a summary"), queue: queue() },
    ]);

    const result = renderPlanDetails(plan);

    expect(result).toContain("### simple");
    expect(result).toContain("Just a summary");
    expect(result).not.toContain("Files to modify:");
  });

  test("separates multiple stages with ---", () => {
    const plan = createExecutionPlan([
      { id: "a", plan: makePlan("Do A"), queue: queue() },
      { id: "b", plan: makePlan("Do B"), queue: queue() },
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
        plan: {
          objective: "The summary text.",
          context: [],
          skills: [],
          targets: ["src/x.ts"],
          inScope: [],
          outScope: [],
          acs: [],
        },
        queue: queue(),
      },
    ]);

    expect(renderPlanDetails(plan, false)).toBe(renderPlanDetails(plan));
  });

  test("verbose=true renders the full plan content instead of a summary", () => {
    const plan = createExecutionPlan([
      {
        id: "full-detail",
        plan: {
          objective: "The summary.",
          context: [],
          skills: [],
          targets: ["src/z.ts"],
          inScope: ["everything"],
          outScope: [],
          acs: [],
        },
        queue: queue(),
      },
    ]);

    const result = renderPlanDetails(plan, true);

    expect(result).toContain("### full-detail");
    // Full structured content must be rendered, not just the extracted summary
    expect(result).toContain("## Files to modify");
    expect(result).toContain("## In scope");
    expect(result).toContain("- everything");
  });

  test("verbose=true includes Dependencies line when stage has dependencies", () => {
    const plan = createExecutionPlan([
      { id: "alpha", plan: makePlan("Alpha plan"), queue: queue() },
      {
        id: "beta",
        plan: makePlan("Beta plan"),
        queue: queue(),
        dependencies: ["alpha"],
      },
    ]);

    const result = renderPlanDetails(plan, true);

    expect(result).toContain("Dependencies: alpha");
  });

  test("verbose=true omits Dependencies line when stage has no dependencies", () => {
    const plan = createExecutionPlan([
      { id: "solo", plan: makePlan("Solo plan"), queue: queue() },
    ]);

    const result = renderPlanDetails(plan, true);

    expect(result).not.toContain("Dependencies:");
  });

  test("verbose=true separates stages with ---", () => {
    const plan = createExecutionPlan([
      { id: "one", plan: makePlan("Plan one"), queue: queue() },
      { id: "two", plan: makePlan("Plan two"), queue: queue() },
    ]);

    const result = renderPlanDetails(plan, true);

    expect(result).toContain("---");
    expect(result).toContain("### one");
    expect(result).toContain("### two");
  });
});
