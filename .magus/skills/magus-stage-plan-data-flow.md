---
name: magus-stage-plan-data-flow
description: Documents how StagePlan data flows through the Magus pipeline from planner output to coder prompts and rendered output. Use when modifying planner output, stage execution, or plan rendering.
---

# Magus Stage Plan Data Flow

Current version: 1.3.0

Describes how structured stage plan data moves through the Magus agent pipeline, including where formatting and consumption happens.

## Inputs

Understanding of the `StagePlan` type (defined in `src/engine/execution-plan.ts`) with fields: `objective`, `context`, `skills`, `targets`, `inScope`, `outScope`, `acs`.

## Outputs

Awareness of where to make changes when modifying plan structure, adding new plan fields, or changing how plan data is consumed.

## Failure Modes

- **Forgetting a consumer**: `StagePlan` is consumed in four places (stage-prompt, orchestrator, render-plan, planner schema). Missing one causes type errors or stale rendering.
- **Duplicate `formatStagePlan` confusion**: `engine/stage-prompt.ts` and `ui/render-plan.ts` each have their own `formatStagePlan` with different signatures and output formats. Modifying the wrong one won't affect the intended output.
- **Schema drift**: The `OUTPUT_SCHEMA` in `planner.ts` must stay in sync with the `StagePlan` TypeScript type. Adding a field to one but not the other causes runtime failures.

## Scope

Covers the data flow from planner output through to coder prompt construction and plan rendering. Does not cover planner prompt engineering or coder agent internals.

## Body

### Data Flow

```
Planner LLM → PlannerOutput.stages[].plan (StagePlan)
  ↓
engine/orchestrator.ts maps to StageDefinition[].plan (StagePlan)
  ↓
createExecutionPlan() → Stage.plan (StagePlan)
  ↓ consumed by:
  ├── engine/stage-prompt.ts: formatStagePlan(id, plan) → markdown string → coder agent prompt
  ├── engine/orchestrator.ts: renderStageSection() → stage.plan.objective → scribe prompt
  └── ui/render-plan.ts:
      ├── extractSummary(plan) → plan.objective
      ├── extractFilesToModify(plan) → bullet list of plan.targets
      └── renderPlanDetails() → verbose uses private formatStagePlan(plan)
```

### Key Formatting Points
| Location | Function | Input | Output |
|---|---|---|---|
| `engine/stage-prompt.ts` | `formatStagePlan(id, plan)` | stage id + StagePlan | Full markdown with `# Stage:` header, Context, Scope, AC sections |
| `engine/stage-prompt.ts` | `buildStagePrompt(stage, plan)` | Stage + ExecutionPlan | Prepends completed dependency context to `formatStagePlan` output |
| `ui/render-plan.ts` | `formatStagePlan(plan)` (private) | StagePlan only | Markdown without stage header, uses `## Context`, `## Files to modify`, etc. |
| `engine/orchestrator.ts` | `renderStageSection()` | Stage | Uses only `plan.objective` for scribe prompt brevity |
### Adding a New StagePlan Field

1. Add the field to `StagePlan` type in `src/engine/execution-plan.ts`
2. Add it to `OUTPUT_SCHEMA` in `src/agents/planner.ts` (under `plan.properties`, add to `required`)
3. Update the `SYSTEM_PROMPT` format instructions in `src/agents/planner.ts`
4. Handle it in `engine/stage-prompt.ts` `formatStagePlan` (for coder prompts)
5. Handle it in `ui/render-plan.ts` private `formatStagePlan` (for verbose plan display)
6. Update test helpers (`makePlan` in stage-prompt and render-plan tests, `addStage` in orchestrator tests)

## Changes
* 1.3.0 - Updated render-plan path references from `engine/render-plan.ts` to `ui/render-plan.ts` after module was moved to ui/ directory
* 1.2.0 - Updated all file path references from `src/` to `src/engine/` after engine directory refactoring
* 1.1.0 - Updated references from `executor.ts` to `stage-prompt.ts` after pure formatting functions were extracted; added `buildStagePrompt` to formatting table
* 1.0.0 - Initial version documenting StagePlan data flow through planner → executor → orchestrator → render-plan pipeline
