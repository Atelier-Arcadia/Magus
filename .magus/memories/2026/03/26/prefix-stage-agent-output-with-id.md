# Prefix Stage Agent Output with Stage ID

## Summary

Updated the `mapStageAgentEvent` function in `src/ui/mapEvent.ts` to prefix all coder agent output with the stage ID (e.g. `[some-stage] output here`). Previously, output from concurrent coder agents during execution was interleaved without attribution, making it difficult for users to determine which agent produced which output.

## Key Decisions

- Prefixed all five event kinds in `mapStageAgentEvent` (`message`, `tool_use`, `tool_result` errors, `result`, `error`) for full consistency — not just `assistant_message`.
- Used the existing `stageId` from the `StageAgentEvent` as the prefix label, matching the stage names shown in the plan DAG.
- Applied a simple `[${sid}] ` prefix format, keeping it concise and grep-friendly.

## Implementation Details

- **File modified**: `src/ui/mapEvent.ts` — the `mapStageAgentEvent` function (lines 49–64).
- The function previously delegated to `mapAgentEvent` (the shared mapper). It was rewritten with its own switch statement so each case could inject the `[stageId]` prefix.
- Tool errors include an additional `tool error:` label after the prefix for clarity.
- The non-stage `mapAgentEvent` function remains unchanged — orchestrator-level agent output (e.g. planner) is not prefixed.

## Outcome

Implementation succeeded. All coder agent output during the execution phase is now clearly attributed to its originating stage, improving readability when multiple stages run concurrently.
