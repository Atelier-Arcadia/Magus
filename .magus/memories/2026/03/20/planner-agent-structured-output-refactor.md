# Planner Agent Structured Output Refactor

## Summary

The planner agent was refactored to exclusively output structured JSON describing plan stages instead of communicating them imperatively via an MCP `PlanStage` tool. The SDK's native `outputFormat: { type: "json_schema" }` option is now used to enforce the output schema, and the orchestrator was updated to consume the `structured_output` field on the result event rather than reading from a `StageSink` buffer. The `PlanStage` tool and `StageSink` infrastructure were removed, and `agentConfig` was stripped from the `Stage`/`StageDefinition` types since executors never used it.

## Key Decisions

- **Structured output over tool calls**: The planner now uses `outputFormat` with a `json_schema` schema rather than calling a `PlanStage` MCP tool per stage. This is cleaner and avoids the side-channel pattern of pushing stages into a shared mutable sink.
- **`PlannerOutput` type exported from `planner.ts`**: The orchestrator imports this type directly so TypeScript can safely cast `event.structured_output` without relying on `any`.
- **`OUTPUT_SCHEMA` extracted as a constant**: The JSON schema definition is extracted into a named `const` to keep `createPlanner()` readable while still using `as const` for the `type` literal.
- **`agentConfig` removed from `StageDefinition`**: The executor always creates its own coder agent via `createCoder(stage.queue)` and never used the stored `agentConfig`, so it was dead weight on the type.
- **`createMessageQueue()` moved to orchestrator**: Each stage definition now gets its queue allocated by the orchestrator when it maps `plannerOutput.stages` into `StageDefinition[]`, keeping the execution plan factory free of queue-creation concerns.
- **`plannerStructuredOutput` reset per invocation in tests**: The mock planner resets `plannerStructuredOutput = null` at the top of each call so that re-plan iterations (implicit approval loop) correctly see no stages by default.

## Implementation Details

### Files Modified

- **`src/agent.ts`**: Added `structured_output?: unknown` to `ResultEvent`; forwarded `message.structured_output` in the `case "result"` success branch of `mapSdkMessage`.
- **`src/agents/planner.ts`**: Completely rewritten factory. Removed `StageSink`/`MessageQueue` parameters. Added `PlannerOutput` export type. Added `OUTPUT_SCHEMA` constant. `createPlanner()` now takes no arguments and configures `outputFormat: { type: "json_schema", schema: OUTPUT_SCHEMA }`. System prompt updated: sections on calling `PlanStage` and presenting markdown replaced with section explaining the structured JSON output contract.
- **`src/execution-plan.ts`**: Removed `import type { AgentConfig }` from `./agent`. Removed `agentConfig` field from `Stage` and `StageDefinition` types. Removed `agentConfig: def.agentConfig` from the stage construction in `createExecutionPlan`.
- **`src/orchestrator.ts`**: Removed `createStageSink` import. Added `PlannerOutput` import from `./agents/planner`. `createPlanner()` called with no args. Planning loop now declares `let plannerOutput: PlannerOutput | undefined`, resets it per iteration, and captures it from `event.structured_output` on result events. Stage definitions built via `plannerOutput.stages.map(s => ({ ...s, queue: createMessageQueue() }))`. Early-return guard updated to `!plannerOutput || plannerOutput.stages.length === 0`.
- **`src/tools/plan-stage.ts`**: File emptied (content removed); no references remain anywhere in the codebase.

### Files Modified (Tests)

- **`src/__tests__/planner.test.ts`**: Rewritten to test `createPlanner()` with no arguments. Asserts `tools`, absence of `mcpTools`, `options.model`, `outputFormat.type === "json_schema"`, and that the schema has `summary`, `stages`, `open_questions` with the correct `stages.items` sub-properties.
- **`src/__tests__/orchestrator.test.ts`**: Removed `mockSink` and `mock.module("../tools/plan-stage", ...)`. Added `plannerStructuredOutput` and `plannerResultSessionIds` shared state. Mock planner now always auto-yields a result event containing `structured_output: plannerStructuredOutput` and `session_id: plannerResultSessionIds[idx]`. Added `addStage()` helper. All tests converted to use `plannerSideEffects[n] = () => addStage(...)` to set up stages.

### Patterns

- The planner → orchestrator communication now follows the same pattern as any other result-bearing agent: data flows out via the `ResultEvent.structured_output` field rather than through shared mutable state.
- Test side effects use index-based `plannerSideEffects` arrays so each invocation in a multi-round plan loop can have independently controlled behavior.

## Outcome

**Success.** All five stages completed. Every core file (`agent.ts`, `planner.ts`, `execution-plan.ts`, `orchestrator.ts`) and their corresponding tests were updated as planned. No dangling references to `plan-stage`, `StageSink`, `createStageSink`, `planStageTool`, or `agentConfig` remain in the codebase. The `plan-stage.ts` file was emptied rather than deleted (functionally equivalent — the file is unreferenced and contains no code).
