import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { MessageQueue } from "../message-queue";
import type { StageDefinition } from "../execution-plan";

/**
 * Accumulator that collects StageDefinitions as the planning agent emits them.
 * The caller reads `stages` after the agent finishes to build an ExecutionPlan.
 */
export type StageSink = {
  stages: StageDefinition[];
};

export function createStageSink(): StageSink {
  return { stages: [] };
}

export function planStageTool(queue: MessageQueue, sink: StageSink) {
  return tool(
    "PlanStage",
    [
      "Define a single stage in a multi-stage execution plan.",
      "",
      "Each stage describes a unit of work that an agent will perform.",
      "Stages form a directed acyclic graph: a stage only runs after all of",
      "its dependencies have completed successfully.",
      "",
      "Rules:",
      "  - Every stage id must be unique within the plan.",
      "  - Dependencies must reference ids of other stages in the same plan.",
      "  - The dependency graph must be acyclic.",
      "  - A stage with no dependencies is a root and may run immediately.",
    ].join("\n"),
    {
      id: z
        .string()
        .describe(
          "Unique identifier for this stage (e.g. 'parse-schema', 'generate-types').",
        ),
      plan: z
        .string()
        .describe(
          "A detailed description of the work this stage should accomplish. " +
            "This will be used as the prompt for the agent that executes the stage.",
        ),
      system_prompt: z
        .string()
        .describe(
          "The system prompt that defines the persona and constraints for the agent executing this stage.",
        ),
      tools: z
        .array(z.string())
        .describe(
          "List of SDK tool names the agent may use (e.g. ['Read', 'Glob', 'Grep']).",
        ),
      dependencies: z
        .array(z.string())
        .optional()
        .describe(
          "IDs of stages that must complete before this one can begin. " +
            "Omit or pass an empty array for root stages.",
        ),
    },
    async ({ id, plan, system_prompt, tools, dependencies }) => {
      queue.push({ kind: "plan-stage", message: `planning stage "${id}"` });

      const definition: StageDefinition = {
        id,
        plan,
        agentConfig: {
          systemPrompt: system_prompt,
          tools,
        },
        queue,
        dependencies: dependencies ?? [],
      };

      sink.stages.push(definition);

      const depText =
        definition.dependencies.length > 0
          ? `depends on: [${definition.dependencies.join(", ")}]`
          : "no dependencies (root stage)";

      return {
        content: [
          {
            type: "text" as const,
            text: `Stage "${id}" registered. ${depText}.`,
          },
        ],
      };
    },
  );
}
