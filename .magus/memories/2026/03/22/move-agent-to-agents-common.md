# Move `src/agent.ts` to `src/agents/common.ts`

## Summary

Relocated the shared agent factory module `src/agent.ts` into the `src/agents/` directory as `common.ts`, consolidating all agent-related files under a single directory. All consumer imports, test imports/mocks, and documentation references were updated to reflect the new path.

## Key Decisions

- **Named the file `common.ts`** rather than keeping `agent.ts` inside the new directory, since it provides shared types and utilities (`AgentEvent`, `AgentConfig`, `createAgent`, `mapSdkMessage`) consumed by all specialized agents (`planner.ts`, `coder.ts`, `scribe.ts`).
- **No internal import changes needed** — `agent.ts` only imported from the external `@anthropic-ai/claude-agent-sdk` package, so the move required no adjustments within the file itself.
- **Parallel follow-up stages** — consumer imports, test imports, and documentation updates were executed in parallel since they had no interdependencies.

## Implementation Details

- **Moved file**: `src/agent.ts` → `src/agents/common.ts` (content unchanged).
- **Updated source consumers**: `src/engine/orchestrator.ts`, `src/engine/executor.ts`, `src/ui/mapEvent.ts` — import paths changed from `../agent` to `../agents/common`.
- **Updated test file**: `src/__tests__/agent.test.ts` — import path changed from `../agent` to `../agents/common`.
- **Updated documentation**: `MAGUS.md` updated to reference `agents/common.ts` instead of `agent.ts`.

## Outcome

**Success.** All four stages completed cleanly. The old `src/agent.ts` file no longer exists, all imports resolve to the new location, and documentation is consistent. No stale references to the old import path remain in source or test files. Historical memory files referencing the old path were correctly left unchanged.
