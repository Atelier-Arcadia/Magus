# Refactor executor.ts — Separate Pure and Effectful Code

## Summary

Refactored `src/executor.ts` into three focused modules following the project's coding guidelines that mandate separating pure functions from effectful code. The `Channel` async concurrency primitive was extracted to `src/channel.ts`, pure stage-prompt formatting functions were extracted to `src/stage-prompt.ts`, and `executor.ts` was slimmed down to a thin effectful orchestration layer. Tests were split correspondingly into `channel.test.ts` and `stage-prompt.test.ts`, with the old `executor.test.ts` replaced by a comment redirect.

## Key Decisions

- **Re-export for backward compatibility**: `executor.ts` re-exports `buildStagePrompt` and `formatStagePlan` from `stage-prompt.ts`. These re-exports are currently unused externally (nothing imports them from executor) but were kept as a convenience.
- **Channel as standalone module**: The `Channel` type and `createChannel` factory are general-purpose async concurrency primitives with no dependency on execution concepts, making them a natural standalone module.
- **Helper functions stay private**: `bulletItems`, `scopeItems`, `acItems`, `formatContextBody`, and `formatScopeBody` are module-private helpers in `stage-prompt.ts` — only `formatStagePlan` and `buildStagePrompt` are exported.
- **Event types remain in executor**: `StageStartEvent`, `StageEndEvent`, `StageAgentEvent`, and `ExecutorEvent` stay in `executor.ts` as they define the executor's public event contract.
- **Old test file kept as redirect**: `executor.test.ts` was reduced to a single comment pointing to `stage-prompt.test.ts` rather than being deleted, providing a breadcrumb for anyone looking for the original tests.

## Implementation Details

### New Files
- `src/channel.ts` — `Channel<T>` type, `makeWake` helper, `createChannel<T>` factory
- `src/stage-prompt.ts` — Pure formatting: `bulletItems`, `scopeItems`, `acItems`, `formatContextBody`, `formatScopeBody`, `formatStagePlan`, `buildStagePrompt`
- `src/__tests__/channel.test.ts` — 6 tests covering push/close/buffer/async behavior
- `src/__tests__/stage-prompt.test.ts` — 14 tests covering formatStagePlan and buildStagePrompt

### Modified Files
- `src/executor.ts` — Reduced to ~116 lines: imports from channel and stage-prompt, event type definitions, `runStage`, and `executePlan`
- `src/__tests__/executor.test.ts` — Replaced with a comment redirect

### Consumers unchanged
- `src/orchestrator.ts` imports `executePlan` and `ExecutorEvent` from executor (unchanged)
- `src/ui/mapEvent.ts` imports `StageEndEvent` and `StageAgentEvent` from executor (unchanged)

## Outcome

The refactoring succeeded cleanly. All three modules have clear single responsibilities: channel.ts is a reusable async primitive, stage-prompt.ts handles pure data-to-markdown formatting, and executor.ts is a thin effectful orchestrator. The separation aligns with the project's coding guidelines and makes each concern independently testable.
