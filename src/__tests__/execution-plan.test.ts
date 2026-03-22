import { describe, expect, test } from "bun:test";
import { createExecutionPlan } from "../execution-plan";
import { createMessageQueue } from "../message-queue";

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
