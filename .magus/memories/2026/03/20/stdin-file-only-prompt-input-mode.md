# stdin / File-Only Prompt Input Mode

## Summary

`src/code.ts` and the `App` component were refactored to remove all interactive (keyboard) prompt entry. Prompts are now read exclusively before the process renders its UI — either from a file path supplied via `--prompt` / `-p`, or from stdin when no flag is given. Three new helpers (`parsePromptFlag`, `parseAutoApprove`, `readPrompt`) were added to `src/code-helpers.ts`, and the program now exits automatically after a single orchestrator run completes. An `--auto-approve` flag was also added to bypass the interactive plan-approval step.

## Key Decisions

- **Prompt read before render**: `await readPrompt(promptFile)` is called at the top level of `src/code.ts` before `render()` is invoked. This keeps the React component stateless with respect to prompt entry and avoids async complexity inside `App`.
- **Single run, then exit**: `App` fires its orchestrator run inside a `useEffect` with empty deps (runs once on mount). When the async generator is exhausted it calls `onExit()`, which unmounts ink, and then `process.exit(0)` is called via `waitUntilExit().then(...)`. There is no loop or 'next prompt' mode.
- **`--auto-approve` flag**: Added as a pure boolean CLI flag. When true, the `onApproval` callback inside `drainOrchestratorRun` immediately resolves with `{ approved: true }` instead of setting `pendingApproval` state and showing the TTY input.
- **`selectSessionId` kept but unused by `App`**: The old helper still exists in `code-helpers.ts` (unchanged). `App` now passes `resumeSessionId` directly since it only ever runs once, making the `hasResumed` guard unnecessary.
- **Removed `evalPromptSubmit` / `PromptSubmitResult`**: These helpers — previously used for the interactive 'enter your prompt' input — were deleted from `App.tsx` and their tests removed from `App.test.tsx`.
- **`makeOnApproval` extracted**: Auto-approve vs. interactive approval branching was extracted into a small pure helper to keep the `useEffect` body readable.

## Implementation Details

### Modified files

| File | Change |
|---|---|
| `src/code-helpers.ts` | Added `parsePromptFlag`, `parseAutoApprove`, `readPrompt` exports |
| `src/code.ts` | Complete rewrite: eager prompt read, new helper imports, `initialPrompt` + `autoApprove` props forwarded to `App` |
| `src/ui/App.tsx` | Removed `Mode` type, `evalPromptSubmit`, `PromptSubmitResult`, `makePromptHandler`, `hasResumed` state, and all interactive-prompt UI; added `initialPrompt` / `autoApprove` to `AppProps`; auto-run via `useEffect` |
| `src/__tests__/code.test.ts` | Added describe blocks for `parsePromptFlag`, `parseAutoApprove`, and `readPrompt` (file-based tests via `Bun.write` to `/tmp`) |
| `src/__tests__/App.test.tsx` | Removed `evalPromptSubmit` tests; updated all `<App>` renders to include `initialPrompt`; added 'renders without throwing', 'calls onExit', and 'auto-approves' tests |

### Patterns used

- **`Bun.file(path).exists()`** for file-existence check before reading.
- **`Bun.stdin.text()`** for consuming all of stdin as a string.
- **`Array.prototype.includes`** for exact-match boolean `--auto-approve` flag (avoids partial matches like `--auto-approved`).
- **`Math.min(longIdx, shortIdx)`** after guarding for `-1` sentinels, to pick the earlier of `--prompt` / `-p` when both appear.

## Outcome

Both stages (`add-prompt-parsing-helpers` and `update-code-and-app`) completed successfully. All four target files match the plan specification: helpers are implemented with correct edge-case handling, `code.ts` reads prompts eagerly and exits after one run, `App.tsx` is stripped of interactive prompt mode, and the test files provide comprehensive coverage of all new and updated behaviour.
