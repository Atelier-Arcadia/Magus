import type { AgentConfig } from "./agent";
import type { MessageQueue } from "./message-queue";

// ── Stage ───────────────────────────────────────────────────────────────────

export type StageStatus = "pending" | "running" | "completed" | "failed";

export type Stage = {
  /** Unique identifier for this stage within the plan. */
  id: string;

  /** Human-readable description of the work this stage performs. */
  plan: string;

  /** Agent configuration that will drive this stage's execution. */
  agentConfig: AgentConfig;

  /** Message queue for capturing events produced during this stage. */
  queue: MessageQueue;

  /**
   * IDs of stages that must complete before this stage can begin.
   * An empty array means the stage has no dependencies (a root node).
   */
  dependencies: string[];

  /** Current execution status. */
  status: StageStatus;
};

// ── ExecutionPlan ───────────────────────────────────────────────────────────

export type ExecutionPlan = {
  /** Ordered map of stage id → Stage. */
  stages: Map<string, Stage>;

  /**
   * Return all stages whose dependencies have all completed
   * and that are themselves still pending.
   */
  ready(): Stage[];

  /** Mark a stage as running. */
  markRunning(stageId: string): void;

  /** Mark a stage as completed. */
  markCompleted(stageId: string): void;

  /** Mark a stage as failed. */
  markFailed(stageId: string): void;

  /** True when every stage is completed or failed. */
  done(): boolean;
};

// ── Factory ─────────────────────────────────────────────────────────────────

export type StageDefinition = {
  id: string;
  plan: string;
  agentConfig: AgentConfig;
  queue: MessageQueue;
  dependencies?: string[];
};

/**
 * Build an ExecutionPlan from an array of stage definitions.
 *
 * Validates that:
 *  - All stage ids are unique.
 *  - Every dependency reference points to a stage that exists.
 *  - The graph is acyclic (topological sort succeeds).
 */
export function createExecutionPlan(
  definitions: StageDefinition[],
): ExecutionPlan {
  const stages = new Map<string, Stage>();

  // ── Build stage map ──────────────────────────────────────────────────────
  for (const def of definitions) {
    if (stages.has(def.id)) {
      throw new Error(`Duplicate stage id: "${def.id}"`);
    }
    stages.set(def.id, {
      id: def.id,
      plan: def.plan,
      agentConfig: def.agentConfig,
      queue: def.queue,
      dependencies: def.dependencies ?? [],
      status: "pending",
    });
  }

  // ── Validate dependency references ───────────────────────────────────────
  for (const stage of stages.values()) {
    for (const dep of stage.dependencies) {
      if (!stages.has(dep)) {
        throw new Error(
          `Stage "${stage.id}" depends on unknown stage "${dep}"`,
        );
      }
    }
  }

  // ── Validate acyclicity (Kahn's algorithm) ──────────────────────────────
  validateDAG(stages);

  // ── Build the plan object ────────────────────────────────────────────────
  return {
    stages,

    ready(): Stage[] {
      const result: Stage[] = [];
      for (const stage of stages.values()) {
        if (stage.status !== "pending") continue;
        const allDepsMet = stage.dependencies.every((dep) => {
          const s = stages.get(dep)!;
          return s.status === "completed";
        });
        if (allDepsMet) result.push(stage);
      }
      return result;
    },

    markRunning(stageId: string) {
      const stage = getStage(stages, stageId);
      assertStatus(stage, "pending");
      stage.status = "running";
    },

    markCompleted(stageId: string) {
      const stage = getStage(stages, stageId);
      assertStatus(stage, "running");
      stage.status = "completed";
    },

    markFailed(stageId: string) {
      const stage = getStage(stages, stageId);
      assertStatus(stage, "running");
      stage.status = "failed";
    },

    done(): boolean {
      for (const stage of stages.values()) {
        if (stage.status !== "completed" && stage.status !== "failed") {
          return false;
        }
      }
      return true;
    },
  };
}

// ── Internal helpers ────────────────────────────────────────────────────────

function getStage(stages: Map<string, Stage>, id: string): Stage {
  const stage = stages.get(id);
  if (!stage) throw new Error(`Unknown stage: "${id}"`);
  return stage;
}

function assertStatus(stage: Stage, expected: StageStatus): void {
  if (stage.status !== expected) {
    throw new Error(
      `Stage "${stage.id}" is "${stage.status}", expected "${expected}"`,
    );
  }
}

function validateDAG(stages: Map<string, Stage>): void {
  // In-degree map
  const inDegree = new Map<string, number>();
  for (const stage of stages.values()) {
    inDegree.set(stage.id, stage.dependencies.length);
  }

  // Seed queue with zero-dependency stages
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  // Build reverse adjacency (stage → stages that depend on it)
  const dependents = new Map<string, string[]>();
  for (const stage of stages.values()) {
    for (const dep of stage.dependencies) {
      let list = dependents.get(dep);
      if (!list) {
        list = [];
        dependents.set(dep, list);
      }
      list.push(stage.id);
    }
  }

  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited++;
    for (const dependent of dependents.get(current) ?? []) {
      const newDeg = inDegree.get(dependent)! - 1;
      inDegree.set(dependent, newDeg);
      if (newDeg === 0) queue.push(dependent);
    }
  }

  if (visited !== stages.size) {
    throw new Error("Execution plan contains a cycle");
  }
}
