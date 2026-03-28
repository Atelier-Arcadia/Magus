# Verbose Flag: Hardcoded Constant to CLI Option

## Summary

Transformed the hardcoded `TO_UPDATE_LATER_VERBOSE_MODE_FLAG` constant in `render-plan.ts` into a proper runtime CLI option (`-v` / `--verbose`). The flag controls whether plan approval output shows full stage plan text with dependencies (verbose) or just summaries and files-to-modify (default). The work was executed across three parallel/sequential stages: adding the CLI parser, updating the render function signature, and threading the flag through all callers.

## Key Decisions

- **Default is non-verbose (`false`)**: Preserves backward compatibility across all call sites. The UI app (`App.tsx`) required no changes since it uses the default.
- **Optional parameter with default value**: `renderPlanDetails(plan, verbose = false)` and `mapOrchestratorEvent(event, nextId, verbose = false)` both use default parameters rather than options objects, keeping the API lightweight.
- **Flat parameter threading**: The verbose flag is passed as a plain boolean through `drainEvents` → `mapOrchestratorEvent` → `renderPlanDetails` rather than introducing a config/options object. This is appropriate for a single flag but may need refactoring if more flags accumulate.
- **Followed existing `parseHideTools` pattern exactly**: `parseVerbose` uses `args.includes()` with both short (`-v`) and long (`--verbose`) forms, consistent with the project's CLI parsing conventions.

## Implementation Details

### Files Modified
- **`src/code-helpers.ts`** — Added `parseVerbose(args: string[]): boolean` (lines 61–68), exported alongside existing parsers.
- **`src/render-plan.ts`** — Removed `TO_UPDATE_LATER_VERBOSE_MODE_FLAG` constant; added `verbose: boolean = false` parameter to `renderPlanDetails`; replaced `if (TO_UPDATE_LATER_VERBOSE_MODE_FLAG)` with `if (verbose)` on line 276.
- **`src/ui/mapEvent.ts`** — Added `verbose: boolean = false` third parameter to `mapOrchestratorEvent`; passes it to `renderPlanDetails` in the `plan_approval_request` case (line 80).
- **`src/code.ts`** — Imports `parseVerbose`; parses `verbose` from CLI args (line 93); threads it through `drainEvents` (line 41) to `mapOrchestratorEvent` (line 44).

### Files Unchanged
- **`src/ui/App.tsx`** — No changes needed; `mapOrchestratorEvent` call on line 51 uses default `verbose=false`.

### Tests Added
- **`src/__tests__/code.test.ts`** — 7 tests for `parseVerbose`: `-v`, `--verbose`, empty, alongside other flags, partial match `--verbose-mode`, uppercase `-V`, unrelated flags.
- **`src/__tests__/render-plan.test.ts`** — Tests for verbose path (full plan text with `## Context` sections and dependency info).
- **`src/__tests__/mapEvent.test.ts`** — 3 tests: verbose=true includes full plan body, verbose=false omits it, explicit false matches default.

## Outcome

Implementation succeeded. All acceptance criteria met across all three stages. The `TO_UPDATE_LATER_VERBOSE_MODE_FLAG` constant is fully removed (confirmed via grep). Existing tests pass unchanged due to backward-compatible default parameters.
