# Add Styled Help Menu with -h / --help Flag

## Summary

Added a `-h` / `--help` CLI flag to Magus that prints a styled, ANSI-colored help menu and exits immediately before any prompt reading or orchestrator setup. The help menu explains what Magus is, its pipeline (plan → approve → execute → scribe), all available CLI flags with descriptions, and multiple ways to provide a prompt (pipe, file, heredoc).

## Key Decisions

- **Early exit before prompt read**: The help check (`parseHelp`) runs immediately after `process.argv.slice(2)` and before any `readPrompt` or orchestrator creation, so `--help` works without providing a prompt.
- **Dedicated `src/ui/help.ts` module**: The help formatting was placed in its own file rather than inlined in `code.ts` or `code-helpers.ts`, keeping the UI presentation layer separate.
- **Reuses existing ANSI constants**: The help menu imports color constants from `src/ui/ansi.ts` (`BOLD`, `CYAN`, `DIM`, `YELLOW`, `GREEN`, `RESET`) rather than defining its own, ensuring consistent styling and automatic graceful degradation in non-TTY environments.
- **Short flag `-h` (lowercase)**: Chose `-h` to avoid collision with `-H` which is already used for `--hide-tools`.

## Implementation Details

- **New file**: `src/ui/help.ts` — exports `formatHelp()` which assembles the multi-section help string from small builder functions (`heading`, `flag`, `example`, and section generators).
- **Modified file**: `src/code-helpers.ts` — added `parseHelp()` function following the established boolean flag parser pattern.
- **Modified file**: `src/code.ts` — added the help check at the top of the main block, before all other initialization.
- **Tests**: `src/__tests__/code.test.ts` — added `parseHelp` describe block (6 tests) and `formatHelp` describe block (8 tests) covering flag parsing edge cases and help content assertions.

## Outcome

Implementation succeeded. The help menu is well-structured with five sections (header, how-it-works pipeline, usage examples, flags reference, and prompt examples). All flags are documented. Tests cover both the parser and the formatted output content. The pattern is consistent with all other CLI flags in the codebase.
