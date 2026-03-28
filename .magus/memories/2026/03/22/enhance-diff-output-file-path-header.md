# Enhance Diff Output with File Path Header

## Summary

Enhanced the `formatDiff` function in `src/ui/format-diff.ts` to display the file path as a bold header at the top of the diff output and wrap the entire output with leading and trailing newlines for visual separation from surrounding text. This was a small, targeted change to improve readability of EditFile tool output in the terminal.

## Key Decisions

- **Bold file path header**: The file path is rendered with ANSI bold styling (`BOLD` + `RESET`) as the first visible line of the diff output, giving immediate context about which file was edited.
- **Newline wrapping**: A leading `\n` before the header and a trailing `\n` after the last diff line ensure the diff block is visually distinct from other console output.

## Implementation Details

- **Modified file**: `src/ui/format-diff.ts` — the `formatDiff` function was updated to construct a `header` string from `BOLD + filePath + RESET`, then return `\n${header}\n${diffLines}\n` instead of just the raw diff lines.
- **Test coverage**: New test section `formatDiff – header and wrapper` was added to `src/__tests__/format-diff.test.ts` with 5 tests covering: leading newline, file path presence in header, bold styling, trailing newline, and full path preservation.
- **Existing test update**: The `header skipping` test for element count was updated to account for the new header line and wrapper newlines (6 elements instead of the previous count).

## Outcome

Implementation succeeded. The change is minimal and well-tested. The diff output now clearly identifies the file being edited and is visually separated from other terminal output, improving the developer experience when using the EditFile tool.
