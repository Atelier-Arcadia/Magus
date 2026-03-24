import { describe, expect, test } from "bun:test";
import {
  extractSummary,
  extractFilesToModify,
  renderPlanDetails,
  renderExecutionPlan,
  renderCyclicPlan,
} from "../ui/render-plan";
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

// ── renderExecutionPlan ─────────────────────────────────────────────────────

describe("renderExecutionPlan", () => {
  test("returns '(empty plan)' for a plan with no stages", () => {
    const plan = createExecutionPlan([]);
    expect(renderExecutionPlan(plan)).toBe("(empty plan)");
  });

  test("renders a single stage as a box containing the stage id", () => {
    const plan = createExecutionPlan([
      { id: "build", plan: makePlan("build it"), queue: queue() },
    ]);
    const result = renderExecutionPlan(plan);
    expect(result).toContain("build");
    expect(result).toContain("\u250c"); // ┌
    expect(result).toContain("\u2514"); // └
    expect(result).toContain("\u2502"); // │
    expect(result).toContain("\u2500"); // ─
  });

  test("renders a single stage with the pending status icon", () => {
    const plan = createExecutionPlan([
      { id: "step", plan: makePlan("do step"), queue: queue() },
    ]);
    expect(renderExecutionPlan(plan)).toContain("\u25cb"); // ○
  });

  test("renders all three box-border characters for a single stage", () => {
    const plan = createExecutionPlan([
      { id: "widget", plan: makePlan("make widget"), queue: queue() },
    ]);
    const result = renderExecutionPlan(plan);
    expect(result).toContain("\u250c"); // ┌
    expect(result).toContain("\u2510"); // ┐
    expect(result).toContain("\u2514"); // └
    expect(result).toContain("\u2518"); // ┘
  });

  test("renders a two-layer DAG with connector characters between layers", () => {
    const plan = createExecutionPlan([
      { id: "alpha", plan: makePlan("alpha"), queue: queue() },
      { id: "beta", plan: makePlan("beta"), queue: queue(), dependencies: ["alpha"] },
    ]);
    const result = renderExecutionPlan(plan);
    expect(result).toContain("alpha");
    expect(result).toContain("beta");
    // vertical connector from parent box exit
    expect(result).toContain("\u2502"); // │
    // downward arrow into child box
    expect(result).toContain("\u25bc"); // ▼
  });

  test("renders a multi-layer DAG with two parallel roots merging into one child", () => {
    const plan = createExecutionPlan([
      { id: "a", plan: makePlan("a"), queue: queue() },
      { id: "b", plan: makePlan("b"), queue: queue() },
      { id: "c", plan: makePlan("c"), queue: queue(), dependencies: ["a", "b"] },
    ]);
    const result = renderExecutionPlan(plan);
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
    // connector zone must include junction routing and entry arrow
    expect(result).toContain("\u25bc"); // ▼
  });

  test("each stage id appears at least once in the rendered output", () => {
    const plan = createExecutionPlan([
      { id: "one", plan: makePlan("one"), queue: queue() },
      { id: "two", plan: makePlan("two"), queue: queue(), dependencies: ["one"] },
    ]);
    const result = renderExecutionPlan(plan);
    expect(result).toContain("one");
    expect(result).toContain("two");
  });
});

// ── renderCyclicPlan ──────────────────────────────────────────────────────────────────────────────

describe("renderCyclicPlan", () => {
  test("returns '(empty plan)' for an empty array", () => {
    expect(renderCyclicPlan([])).toBe("(empty plan)");
  });

  test("renders a self-referential stage without throwing and includes the stage id", () => {
    const result = renderCyclicPlan([{ id: "x", dependencies: ["x"] }]);
    expect(result).toContain("x");
    expect(result).toContain("\u250c"); // ┌
    expect(result).toContain("\u2514"); // └
  });

  test("renders a two-stage cycle without infinite loop and includes both ids", () => {
    const result = renderCyclicPlan([
      { id: "a", dependencies: ["b"] },
      { id: "b", dependencies: ["a"] },
    ]);
    expect(result).toContain("a");
    expect(result).toContain("b");
  });

  test("renders a three-stage cycle without infinite loop and includes all ids", () => {
    const result = renderCyclicPlan([
      { id: "alpha", dependencies: ["gamma"] },
      { id: "beta",  dependencies: ["alpha"] },
      { id: "gamma", dependencies: ["beta"] },
    ]);
    expect(result).toContain("alpha");
    expect(result).toContain("beta");
    expect(result).toContain("gamma");
  });

  test("renders a mixed cyclic/acyclic graph and includes all stage ids", () => {
    const result = renderCyclicPlan([
      { id: "root",   dependencies: [] },
      { id: "cycleA", dependencies: ["cycleB"] },
      { id: "cycleB", dependencies: ["cycleA"] },
    ]);
    expect(result).toContain("root");
    expect(result).toContain("cycleA");
    expect(result).toContain("cycleB");
  });

  test("renders a single non-cyclic stage as a box with border characters", () => {
    const result = renderCyclicPlan([{ id: "solo", dependencies: [] }]);
    expect(result).toContain("solo");
    expect(result).toContain("\u250c"); // ┌
    expect(result).toContain("\u2510"); // ┐
    expect(result).toContain("\u2514"); // └
    expect(result).toContain("\u2518"); // ┘
  });

  test("renders a linear chain with connector arrow characters", () => {
    const result = renderCyclicPlan([
      { id: "first",  dependencies: [] },
      { id: "second", dependencies: ["first"] },
      { id: "third",  dependencies: ["second"] },
    ]);
    expect(result).toContain("first");
    expect(result).toContain("second");
    expect(result).toContain("third");
    expect(result).toContain("\u25bc"); // ▼ downward entry arrow
  });

  test("renders stages with the pending status icon", () => {
    const result = renderCyclicPlan([{ id: "task", dependencies: [] }]);
    expect(result).toContain("\u25cb"); // ○ pending
  });

  test("all stage ids appear for a complex cyclic graph with an acyclic in-edge", () => {
    // a→b→c→a (3-node cycle), d→b (external node pointing into cycle)
    const result = renderCyclicPlan([
      { id: "a", dependencies: ["b"] },
      { id: "b", dependencies: ["c"] },
      { id: "c", dependencies: ["a"] },
      { id: "d", dependencies: ["b"] },
    ]);
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
    expect(result).toContain("d");
  });
});
