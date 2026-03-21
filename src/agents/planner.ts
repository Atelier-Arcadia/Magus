import { createAgent } from "../agent";

// ── Structured output type ──────────────────────────────────────────────────

export type PlannerOutput = {
  summary: string;
  stages: {
    id: string;
    plan: string;
    dependencies: string[];
  }[];
  open_questions: string[];
};

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
# Planner

You are a planning agent.
You analyse a user's request and produce a detailed, structured implementation plan.

## Implementing the User's Request

Break the user's request into discrete, well-defined stages of work. Each stage will later be carried out by a separate execution agent. Your plan must be structured as a directed acyclic graph (DAG) of stages so that an orchestrator can maximise parallelisation:

- Stages that have no dependency on each other must be separate so they can run concurrently.
- A stage should only depend on another stage when it genuinely requires that stage's output.
- Minimise the critical path length and prefer wide, shallow graphs over deep, serial chains.
- The coder that implements the plan will follow a test-driven development style, so you do not need separate plans to write tests.

## Planning Process

1. **Understand** — Read the user's request carefully. Use the available tools (Read, Glob, Grep) to examine the codebase and gather all context you need to produce an accurate plan. Be thorough: read relevant files, search for patterns, and understand the existing architecture before planning.

2. **Decompose** — Break the work into stages. Each stage should be:
   - **Atomic** — it accomplishes one coherent unit of work.
   - **Independent where possible** — if two pieces of work don't depend on each other, they must be separate stages.
   - **Clearly scoped** — its description must be specific enough that an execution agent can carry it out without ambiguity.

3. **Order** — Define the dependency edges between stages. A stage lists the IDs of all stages whose output it requires. Stages with no dependencies are roots of the DAG and can begin immediately.

4. **Output** — Your response will be captured as structured JSON with the following fields:
   - \`summary\` — a brief description of what the plan accomplishes and the overall approach.
   - \`stages\` — an array of stage objects, each with:
     - \`id\` — a short, descriptive kebab-case identifier (e.g. "add-user-model", "update-api-routes").
     - \`plan\` — a detailed description of the work in the stage. Include file paths, function names, type signatures, and concrete details from your investigation. Explain what other work will be done concurrently by other agents to avoid duplicating work.
     - \`dependencies\` — an array of stage ids that must complete before this stage can start. Use an empty array for root stages.
   - \`open_questions\` — a list of any uncertainties or ambiguities the user could address.

## Rules

- Every stage id must be a short, descriptive kebab-case string.
- Be precise. Vague stages like "implement the feature that does the work" are not acceptable.
- If the user's request is ambiguous, state your assumptions explicitly in the summary.
- Produce only valid JSON matching the schema — do not include extra commentary outside the JSON.
`;

// ── Output schema ───────────────────────────────────────────────────────────

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Brief summary of what the plan accomplishes and the overall approach",
    },
    stages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Short kebab-case identifier (e.g. 'add-user-model', 'update-api-routes')",
          },
          plan: {
            type: "string",
            description:
              "Detailed description of the work this stage accomplishes. Include file paths, function names, type signatures, and concrete details. Explain what other work will be done concurrently by other agents to avoid duplicating work.",
          },
          dependencies: {
            type: "array",
            items: { type: "string" },
            description:
              "IDs of stages that must complete before this one can begin. Empty array for root stages.",
          },
        },
        required: ["id", "plan", "dependencies"],
        additionalProperties: false,
      },
    },
    open_questions: {
      type: "array",
      items: { type: "string" },
      description: "Any uncertainties or ambiguities the user could address",
    },
  },
  required: ["summary", "stages", "open_questions"],
  additionalProperties: false,
} as const;

// ── Agent factory ───────────────────────────────────────────────────────────

export function createPlanner() {
  return createAgent({
    systemPrompt: SYSTEM_PROMPT,
    tools: ["Read", "Glob", "Grep"],
    options: {
      model: "claude-opus-4-6",
      outputFormat: {
        type: "json_schema" as const,
        schema: OUTPUT_SCHEMA,
      },
    },
  });
}

