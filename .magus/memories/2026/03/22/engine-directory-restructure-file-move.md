# Engine Directory Restructure

## Summary

Moved 10 engine-related source files from `src/` into a new `src/engine/` subdirectory to improve code organization. The moved files include the core orchestration pipeline (`orchestrator.ts`, `executor.ts`, `execution-plan.ts`, `channel.ts`, `stage-prompt.ts`, `message-queue.ts`) and supporting modules (`render-plan.ts`, `save-plan.ts`, `scribe-runner.ts`, `prompt-for-approval.ts`). All import paths across the codebase, tests, and documentation were updated accordingly.

## Key Decisions

- **Grouped by responsibility:** All files related to the plan-execute-scribe pipeline were co-located under `src/engine/`, while agent definitions, tools, UI, and config remained in their existing locations.
- **No barrel/index file:** Files are imported directly rather than through a re-export barrel, keeping the existing import style consistent.
- **Two-phase move:** Core files were moved first, then supporting files, to keep each stage reviewable and reduce the blast radius of import changes.
- **Parallel consumer updates:** External consumers (`src/code.ts`, `src/assistant.ts`, `src/ui/mapEvent.ts`), tests, and documentation were updated in parallel after both move stages completed.

## Implementation Details

- **Files moved (10):** `orchestrator.ts`, `executor.ts`, `execution-plan.ts`, `channel.ts`, `stage-prompt.ts`, `message-queue.ts`, `render-plan.ts`, `save-plan.ts`, `scribe-runner.ts`, `prompt-for-approval.ts`.
- **Import adjustments inside engine files:** References to sibling directories changed from `./agent` → `../agent`, `./agents/planner` → `../agents/planner`, etc.
- **Import adjustments in consumers:** References changed from `./orchestrator` → `./engine/orchestrator`, and similarly for `../` paths in `src/ui/`.
- **Documentation updated:** `MAGUS.md` and the `magus-stage-plan-data-flow` skill file were updated to reflect the new `src/engine/` paths.

## Outcome

The implementation succeeded cleanly. All 10 files exist in `src/engine/`, none remain at the old `src/` locations, and no stale import paths were found in source files, tests, or documentation.
