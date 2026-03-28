# Refactor Stage Plan from String to Structured Type

## Summary

Refactored the `plan` field on `Stage`, `StageDefinition`, and `PlannerOutput` from a plain markdown string to a structured `StagePlan` object with seven typed fields: `objective`, `context`, `skills`, `targets`, `inScope`, `outScope`, and `acs`. All consumers—executor, orchestrator, render-plan, and planner—were updated to produce or consume the new type, with `formatStagePlan` functions converting back to markdown where string output is needed (coder prompts, verbose plan rendering). All four test files were updated and pass.

## Key Decisions

- **Type lives in `execution-plan.ts`**: `StagePlan` is exported alongside `Stage` and `StageDefinition` since it's a core data structure used across the system.
- **Two `formatStagePlan` functions**: `executor.ts` has a public `formatStagePlan(id, plan)` that produces the full coder-facing markdown (with `# Stage:` header, Context/Scope/AC sections). `render-plan.ts` has a private `formatStagePlan(plan)` used only for verbose rendering (no stage header, different section naming). These are intentionally separate to serve different formatting needs.
- **Orchestrator scribe prompt uses `plan.objective` only**: Rather than rendering the full structured plan, `renderStageSection` in the orchestrator just uses `stage.plan.objective` for the scribe prompt—keeping it concise since the scribe receives the full rendered DAG diagram separately.
- **Empty arrays omit sections**: Both formatters skip sections when the corresponding array is empty, avoiding ugly empty headers in output.
- **Planner JSON schema updated with `additionalProperties: false`**: The OUTPUT_SCHEMA for the plan object enforces strict shape validation, ensuring all 7 fields are required and no extra fields sneak in.
- **Helper `makePlan()` pattern in tests**: Both `executor.test.ts` and `render-plan.test.ts` use a `makePlan(objective)` helper that returns a `StagePlan` with all arrays empty, reducing boilerplate.

## Implementation Details

### Modified Files
- `src/execution-plan.ts` — Added `StagePlan` type definition; changed `Stage.plan` and `StageDefinition.plan` from `string` to `StagePlan`
- `src/agents/planner.ts` — Updated `PlannerOutput.stages[].plan` to `StagePlan`; rewrote `SYSTEM_PROMPT` Step 4 and `<format>` block to instruct structured JSON output; updated `OUTPUT_SCHEMA` with nested object schema for plan
- `src/executor.ts` — Added `formatStagePlan(id, plan)` and helpers (`bulletItems`, `scopeItems`, `acItems`, `formatContextBody`, `formatScopeBody`); updated `buildStagePrompt` to call `formatStagePlan`
- `src/orchestrator.ts` — Updated `renderStageSection` to use `stage.plan.objective` instead of `stage.plan` (string)
- `src/render-plan.ts` — Simplified `extractSummary` to return `plan.objective`; simplified `extractFilesToModify` to format `plan.targets`; added private `formatStagePlan` for verbose mode; updated `renderPlanDetails` for both verbose and non-verbose paths
- `src/__tests__/planner.test.ts` — Added test verifying plan schema is an object with all 7 fields
- `src/__tests__/executor.test.ts` — Switched all plan values to `StagePlan` objects via `makePlan` helper
- `src/__tests__/orchestrator.test.ts` — Updated `addStage` helper and `mockPlan` to use `StagePlan` objects
- `src/__tests__/render-plan.test.ts` — Rewrote all tests to use `StagePlan` objects; tests cover both verbose and non-verbose rendering

## Outcome

The implementation succeeded. All five stages completed successfully. The type change propagated cleanly through the system with no gaps. The structured `StagePlan` type now makes planner output data programmatically accessible, enabling future features like automatic file pre-loading, skill injection, or targeted context management based on the `context`, `skills`, and `targets` arrays.
