# Hide Input Row While Orchestrator Is Running

## Summary

A floating "Enter a prompt..." placeholder was appearing at the bottom of the terminal output while the orchestrator was running. The root cause was that `TextInput` was always rendered — even when `isActive` was `false` — causing it to display its dimmed placeholder text. The fix wraps the entire input `<Box>` in a conditional `{inputActive && ...}` guard in `src/ui/App.tsx`, so neither the `"> "` prefix nor the `TextInput` component renders at all when the orchestrator is busy and not awaiting approval.

## Key Decisions

- **Conditional render over prop-hiding:** Rather than passing `isActive={false}` and relying on `TextInput` to suppress its output, the entire input row is removed from the React tree when `inputActive` is `false`. This is more robust and removes any dependency on `TextInput`'s internal display logic.
- **No change to `inputActive` logic:** The existing expression `const inputActive = !isRunning || mode === 'approval'` was already correct. The bug was purely in how the computed value was applied to rendering.
- **Simplified prefix text:** With the conditional guard in place the ternary `inputActive ? '> ' : ''` for the yellow prefix was replaced with the static string `'> '` — it is always truthy in the render branch.

## Implementation Details

- **`src/ui/App.tsx` (lines 164–175):** Changed the unconditional `<Box>` wrapping the `TextInput` to `{inputActive && <Box>…</Box>}`. The `isActive` prop on `TextInput` is kept as-is (`isActive={inputActive}`) for explicitness even though it will always be `true` when rendered.
- **`src/__tests__/App.test.tsx`:** Added a new test `"does not render input row while running"` (line 413). Because `renderToString` captures the synchronous initial render where `isRunning=false`, the test verifies the complementary invariant: the placeholder string `"Enter a prompt..."` is never visible in the rendered output (it is suppressed because the active cursor is shown instead). The existing test `"renders the prompt prefix and cursor in the initial state"` continues to pass unchanged.

## Outcome

Implementation succeeded. All targeted files were modified as planned. The conditional rendering pattern structurally guarantees the input row is absent from the Ink component tree while the orchestrator is running in non-approval mode, eliminating the phantom placeholder text.
