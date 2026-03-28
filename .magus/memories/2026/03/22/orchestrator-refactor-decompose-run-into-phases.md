# Orchestrator Refactor: Decompose `run()` Into Phases

## Summary

Refactored the monolithic `run()` async generator in `orchestrator.ts` (~120 lines) into a composable pipeline of smaller, focused async generator functions. The `run()` method was decomposed into `planningLoop()`, `executionPhase()`, and `scribePhase()`, with several pure helpers extracted to support the planning cycle. The resulting `run()` is a thin ~15-line pipeline that composes these phases.

## Key Decisions

- **Two-stage execution**: The work was split into two stages — first extracting the simpler linear phases (`executionPhase`, `scribePhase`), then tackling the more complex planning loop with its branching and state management.
- **`yield*` delegation pattern**: Each extracted phase is an async generator, and `run()` delegates to them via `yield*`. For `planningLoop` and `requestApproval`, the generators use `yield*` with return values (`AsyncGenerator<Event, Result>`) to thread results back to the caller without mutable closures.
- **Discriminated union for iteration outcomes**: Introduced an `IterationOutcome` type (`approved | feedback | no_stages`) to make the planning loop's branching explicit and type-safe, replacing implicit mutable state.
- **Eliminated mutable `plannerSessionId` closure**: Session state is now threaded through return values (`PlanningResult`, `PlannerIterationResult`) instead of being captured in a mutable closure variable.
- **Pure helper extraction**: `updateFromPlannerEvent`, `buildPlan`, and `renderStageSection` were extracted as pure functions at module scope, keeping side-effect-free logic separate from generator orchestration.

## Implementation Details

- **File modified**: `src/orchestrator.ts` (sole file in scope)
- **New types**: `PlanningResult`, `PlannerIterationResult`, `IterationOutcome` — all at module scope for planning state flow
- **New functions**:
  - `planningLoop()` — the while-loop plan/approve/refine cycle
  - `planningIteration()` — a single iteration: run planner, build plan, request approval
  - `runPlannerIteration()` — streams planner agent events, collects session ID and output
  - `requestApproval()` — yields approval event and awaits user response
  - `resolveNoStages()` — handles the edge case of planner returning no stages
  - `executionPhase()` — wraps `executePlan` with phase start/end events
  - `scribePhase()` — builds scribe prompt and streams scribe agent events
  - `updateFromPlannerEvent()` — pure helper to extract session ID and output from agent events
  - `buildPlan()` — pure helper to map planner output stages to an `ExecutionPlan`
- **`run()` final shape**: ~15 lines — emits initial session event, delegates to `planningLoop`, saves plan, delegates to `executionPhase`, delegates to `scribePhase`, emits final session event.

## Outcome

The refactoring completed successfully across both stages. The code now follows the project's functional programming style guidelines: small pure functions, single responsibilities, immutable data threading via return values, and a clear compositional pipeline. The `run()` method reads as a high-level description of the orchestration flow rather than a monolithic procedure.
