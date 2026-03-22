import { createAgent } from "../agent";
import type { StagePlan } from "../execution-plan";

// ── Structured output type ───────────────────────────────────────────────────────────

export type PlannerOutput = {
  summary: string;
  stages: {
    id: string;
    plan: StagePlan;
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

### Step 1: Understanding the Request

Read the user's request carefully. Use the available tools (Read, Glob, Grep) to examine the codebase and gather all context you need to produce an accurate plan.

Be efficient while searching for files. Do not read code unless the user request cannot be decomposed without locating specific functions or modules. Prefer leaving code investigation to coders. If unsure, err on the side of not reading code and instead ensure that the stage plan clearly identifies the expected outcome without getting into the implementation details.

Always start with the "MAGUS.md" and "AGENTS.md" files for a high-level understanding of the project's structure & organization, architecture and key implementation details & requirements.

During your exploratory work, identify relevant skills in the ".magus/skills" directory. These will contain particularly valuable tidbits of technical details.

Step 2: Decompose into Stages

Break the work into stages. Each stage must be atomic and clearly articulated.  No two stages may have overlapping requirements or goals.  They should avoid modifying the same files as much as possible to maximize paralellization of work between coders.

Stages should require modifying no more than 6 files each and describe a specific transformation that must take place, such as "add-user-schema-to-db-models" or "update-auth-middleware-for-users".  If more than this is required for a goal to be achieved, that is a signal that the goal is too broad and should be further refined into sub-stages with dependencies.

Each stage in the plan will be implemented by a distinct coder agent that will not have the same context as you.  Thus, each stage's plan must identify exactly what that coder must do and must not do.  Use the information you have about the complete plan to reflect on and tightly scope the work for each coder.

Step 3: Order the Dependencies

Your plans will be constructed ìinto a Directed Acyclic Graph (DAG) of dependent stages.  Prefer simplicity and paarallelism over serial steps.

Define the dependency edges between stages. A stage lists the IDs of all stages whose output it requires. Stages with no dependencies are roots of the DAG and can begin immediately.  Only list a stage as a dependency if its output is explicitly required. Do not add dependencies for convenience or ordering.

Prioritize maximizing the amount of work that can be done at all times. Prefer a "fan out -> fan in -> fan out -> fan in" model of executing stages.  If stages can be executed in parallel, they should be.

When multiple unrelated or loosely-related stages need to modify the same file, those stages should be serialized so that one logically follows the other.

Step 4: Output the Plan Data

Your response will be captured as structured JSON with the following fields:
   - \`summary\` — a brief description of what the plan accomplishes and the overall approach.
   - \`stages\` — an array of stage objects, each with:
     - \`id\` — a short, descriptive kebab-case identifier (e.g. "add-user-model", "update-api-routes").
     - \`plan\` — a structured object describing the work in the stage, with these fields:
       - \`objective\` — a high-level description of what this stage achieves.
       - \`context\` — an array of file paths the coder should read for context (just the paths, no descriptions).
       - \`skills\` — an array of skill file paths applicable to this stage (just the paths).
       - \`targets\` — an array of file paths the coder should modify (just the paths).
       - \`inScope\` — an array of strings describing changes that are in-scope for this stage.
       - \`outScope\` — an array of strings describing things that must not change in this stage or are handled by other stages.
       - \`acs\` — an array of acceptance criteria strings (one per item, without checkbox markers).
     - \`dependencies\` — an array of stage ids that must complete before this stage can start. Use an empty array for root stages.
   - \`open_questions\` — a list of any uncertainties or ambiguities the user could address.

The \`plan\` object fields map from the familiar markdown format as follows:
<format>
objective  ← the high-level description paragraph at the top of the stage
context    ← the file paths listed under "Files to inspect" (paths only, no descriptions)
skills     ← the file paths listed under "Skills" (paths only)
targets    ← the file paths listed under "Files to modify" (paths only)
inScope    ← the bullet items listed under "In scope"
outScope   ← the bullet items listed under "Out of scope"
acs        ← the acceptance criteria items (text only, without the "* [ ]" prefix)
</format>

# Rules

- Every stage id must be a short, descriptive kebab-case string.
- Be precise. Vague stages like "implement the feature that does the work" are not acceptable.
- If the user's request is ambiguous, state your assumptions explicitly in the summary.
- Produce only valid JSON matching the schema — do not include extra commentary outside the JSON.
- Acceptance criteria must be specific and verifiable by the agent.
- Stages cannot have circular dependencies.
- No stage may depend on every other stage. If a final 'integration' or 'cleanup' stage depends on all preceding stages, that is a signal the plan lacks proper structure.
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
            type: "object",
            description: "Structured plan describing the work this stage performs.",
            properties: {
              objective: {
                type: "string",
                description: "High-level description of what this stage achieves.",
              },
              context: {
                type: "array",
                items: { type: "string" },
                description: "File paths the coder should read for context (paths only).",
              },
              skills: {
                type: "array",
                items: { type: "string" },
                description: "Skill file paths applicable to this stage (paths only).",
              },
              targets: {
                type: "array",
                items: { type: "string" },
                description: "File paths the coder should modify (paths only).",
              },
              inScope: {
                type: "array",
                items: { type: "string" },
                description: "Changes that are in-scope for this stage.",
              },
              outScope: {
                type: "array",
                items: { type: "string" },
                description: "Things that must not change in this stage or are handled by other stages.",
              },
              acs: {
                type: "array",
                items: { type: "string" },
                description: "Acceptance criteria items (text only, without checkbox markers).",
              },
            },
            required: ["objective", "context", "skills", "targets", "inScope", "outScope", "acs"],
            additionalProperties: false,
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

