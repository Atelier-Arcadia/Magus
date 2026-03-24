import { describe, expect, test } from "bun:test";
import { createExecutionPlan, detectCycles } from "../engine/execution-plan";
import { createMessageQueue } from "../engine/message-queue";

const queue = () => createMessageQueue();

describe("execution-plan", () => {
  describe("markCompleted", () => {
    test("stores the result on the stage", () => {
      const plan = createExecutionPlan([
        { id: "a", plan: "do a", queue: queue() },
      ]);

      plan.markRunning("a");
      plan.markCompleted("a", "Created foo.ts with Bar interface");

      expect(plan.stages.get("a")!.result).toBe(
        "Created foo.ts with Bar interface",
      );
    });

    test("stage result is initialized to empty string", () => {
      const plan = createExecutionPlan([
        { id: "a", plan: "do a", queue: queue() },
      ]);

      expect(plan.stages.get("a")!.result).toBe("");
    });

    test("result is preserved through status transitions", () => {
      const plan = createExecutionPlan([
        { id: "a", plan: "do a", queue: queue() },
        { id: "b", plan: "do b", queue: queue(), dependencies: ["a"] },
      ]);

      plan.markRunning("a");
      plan.markCompleted("a", "Stage a result");

      // b becomes ready and can read a's result
      const ready = plan.ready();
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe("b");
      expect(plan.stages.get("a")!.result).toBe("Stage a result");
    });
  });
});

describe("detectCycles", () => {
  test("returns empty array for empty input", () => {
    expect(detectCycles([])).toEqual([]);
  });

  test("returns empty array when no stage has dependencies", () => {
    const stages = [
      { id: "a", dependencies: [] },
      { id: "b", dependencies: [] },
    ];
    expect(detectCycles(stages)).toEqual([]);
  });

  test("returns empty array for a linear chain", () => {
    const stages = [
      { id: "a", dependencies: [] },
      { id: "b", dependencies: ["a"] },
      { id: "c", dependencies: ["b"] },
    ];
    expect(detectCycles(stages)).toEqual([]);
  });

  test("detects a self-referential cycle", () => {
    const stages = [{ id: "a", dependencies: ["a"] }];
    expect(detectCycles(stages)).toEqual([["a", "a"]]);
  });

  test("detects a 2-node cycle", () => {
    const stages = [
      { id: "a", dependencies: ["b"] },
      { id: "b", dependencies: ["a"] },
    ];
    expect(detectCycles(stages)).toEqual([["a", "b", "a"]]);
  });

  test("detects a 3-node cycle", () => {
    const stages = [
      { id: "a", dependencies: ["b"] },
      { id: "b", dependencies: ["c"] },
      { id: "c", dependencies: ["a"] },
    ];
    expect(detectCycles(stages)).toEqual([["a", "b", "c", "a"]]);
  });

  test("detects multiple independent cycles", () => {
    const stages = [
      { id: "a", dependencies: ["b"] },
      { id: "b", dependencies: ["a"] },
      { id: "c", dependencies: ["d"] },
      { id: "d", dependencies: ["c"] },
    ];
    const result = detectCycles(stages);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(["a", "b", "a"]);
    expect(result).toContainEqual(["c", "d", "c"]);
  });

  test("detects only cyclic portions in a mixed graph", () => {
    const stages = [
      { id: "root", dependencies: [] },
      { id: "leaf", dependencies: ["root"] },
      { id: "x", dependencies: ["y"] },
      { id: "y", dependencies: ["x"] },
    ];
    const result = detectCycles(stages);
    expect(result).toHaveLength(1);
    expect(result).toContainEqual(["x", "y", "x"]);
  });

  test("detects a cycle when one stage in a DAG has a back-edge", () => {
    const stages = [
      { id: "a", dependencies: [] },
      { id: "b", dependencies: ["a"] },
      { id: "c", dependencies: ["b", "a"] },
      { id: "d", dependencies: ["c", "b"] },
      { id: "e", dependencies: ["d"] },
      { id: "f", dependencies: ["e", "b"] },
      { id: "g", dependencies: ["f", "c"] },
      { id: "loop", dependencies: ["loop"] },
    ];
    const result = detectCycles(stages);
    expect(result).toEqual([["loop", "loop"]]);
  });

  test("detects a cycle of 4 or more nodes", () => {
    // a→b→c→d→a: following each dependency edge forms a ring of length 4
    const stages = [
      { id: "a", dependencies: ["b"] },
      { id: "b", dependencies: ["c"] },
      { id: "c", dependencies: ["d"] },
      { id: "d", dependencies: ["a"] },
    ];
    const result = detectCycles(stages);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(["a", "b", "c", "d", "a"]);
    expect(result[0][0]).toBe(result[0][result[0].length - 1]);
  });

  test("detects overlapping cycles that share a common node", () => {
    // cycle 1: a→b→c→a; cycle 2: c→d→e→c — node c belongs to both cycles
    const stages = [
      { id: "a", dependencies: ["b"] },
      { id: "b", dependencies: ["c"] },
      { id: "c", dependencies: ["a", "d"] },
      { id: "d", dependencies: ["e"] },
      { id: "e", dependencies: ["c"] },
    ];
    const result = detectCycles(stages);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(["a", "b", "c", "a"]);
    expect(result).toContainEqual(["c", "d", "e", "c"]);
    for (const cycle of result) {
      expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    }
  });

  test("detects multiple cycles in a fully strongly connected component with cross-edges", () => {
    // a→b, b→c, b→d (cross-edge), c→a, d→a — every node reachable from every other
    const stages = [
      { id: "a", dependencies: ["b"] },
      { id: "b", dependencies: ["c", "d"] },
      { id: "c", dependencies: ["a"] },
      { id: "d", dependencies: ["a"] },
    ];
    const result = detectCycles(stages);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(["a", "b", "c", "a"]);
    expect(result).toContainEqual(["a", "b", "d", "a"]);
    for (const cycle of result) {
      expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    }
  });

  test("detects only the cyclic portion when cycle is reachable through an acyclic prefix", () => {
    // root and mid are acyclic entry points; x→y→z→x is the only cycle
    const stages = [
      { id: "root", dependencies: [] },
      { id: "mid", dependencies: ["root"] },
      { id: "x", dependencies: ["mid", "y"] },
      { id: "y", dependencies: ["z"] },
      { id: "z", dependencies: ["x"] },
    ];
    const result = detectCycles(stages);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(["x", "y", "z", "x"]);
    expect(result[0][0]).toBe(result[0][result[0].length - 1]);
  });

  test("detects the cycle in a diamond-with-back-edge topology", () => {
    // Diamond: a→b, a→c, b→d, c→d; back-edge: d→a closes the cycle through the diamond
    const stages = [
      { id: "a", dependencies: ["b", "c"] },
      { id: "b", dependencies: ["d"] },
      { id: "c", dependencies: ["d"] },
      { id: "d", dependencies: ["a"] },
    ];
    const result = detectCycles(stages);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(["a", "b", "d", "a"]);
    expect(result[0][0]).toBe(result[0][result[0].length - 1]);
    expect(result[0]).toContain("d"); // back-edge node d must appear in the cycle
  });

  test("detects multiple cycles of different lengths coexisting in the same graph", () => {
    // self-loop (1 node), 2-node cycle, 4-node cycle, plus an acyclic root stage
    const stages = [
      { id: "root", dependencies: [] },
      { id: "self", dependencies: ["self"] },
      { id: "p", dependencies: ["q"] },
      { id: "q", dependencies: ["p"] },
      { id: "w", dependencies: ["x"] },
      { id: "x", dependencies: ["y"] },
      { id: "y", dependencies: ["z"] },
      { id: "z", dependencies: ["w"] },
    ];
    const result = detectCycles(stages);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual(["self", "self"]);
    expect(result).toContainEqual(["p", "q", "p"]);
    expect(result).toContainEqual(["w", "x", "y", "z", "w"]);
    for (const cycle of result) {
      expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    }
  });

  test("does not produce false cycles for dangling dependency references", () => {
    // 'a' depends on 'nonexistent' which is not in the input — must be silently skipped
    const stages = [
      { id: "a", dependencies: ["nonexistent"] },
      { id: "b", dependencies: [] },
      { id: "c", dependencies: ["b"] },
    ];
    expect(detectCycles(stages)).toEqual([]);
  });

  test("detects one large cycle from a long chain with a single back-edge to the second node", () => {
    // 9 nodes: n1 is the acyclic entry; n2 through n9 form a cycle via the back-edge n9→n2
    const stages = [
      { id: "n1", dependencies: ["n2"] },
      { id: "n2", dependencies: ["n3"] },
      { id: "n3", dependencies: ["n4"] },
      { id: "n4", dependencies: ["n5"] },
      { id: "n5", dependencies: ["n6"] },
      { id: "n6", dependencies: ["n7"] },
      { id: "n7", dependencies: ["n8"] },
      { id: "n8", dependencies: ["n9"] },
      { id: "n9", dependencies: ["n2"] },
    ];
    const result = detectCycles(stages);
    expect(result).toHaveLength(1);
    const [cycle] = result;
    expect(cycle).toEqual(["n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9", "n2"]);
    expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    expect(cycle).toHaveLength(9); // 8 distinct nodes + repeated start node
  });

  test("detects both cycles when a node participates in two distinct cycles through different dependencies", () => {
    // 'b' participates in cycle 1 (a→b→c→a) via its 'c' dep and cycle 2 (b→d→e→b) via its 'd' dep
    const stages = [
      { id: "a", dependencies: ["b"] },
      { id: "b", dependencies: ["c", "d"] },
      { id: "c", dependencies: ["a"] },
      { id: "d", dependencies: ["e"] },
      { id: "e", dependencies: ["b"] },
    ];
    const result = detectCycles(stages);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(["a", "b", "c", "a"]);
    expect(result).toContainEqual(["b", "d", "e", "b"]);
    for (const cycle of result) {
      expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    }
  });
});

