---
name: ansi-escape-terminal-styling
description: Reference for ANSI escape sequences and the centralized ansi.ts module with TTY-gated color output. Use when generating colored terminal output or modifying ANSI constants.
---

# ANSI Escape Terminal Styling

Current version: 0.1.0

Provides a quick reference for ANSI SGR (Select Graphic Rendition) escape codes and documents the centralized `src/ansi.ts` module that gates all ANSI output on TTY detection.

## Inputs

A need to render styled text (bold, italic, colored) in a terminal emulator, or a need to add/modify ANSI color constants in the codebase.

## Outputs

Correctly formatted ANSI escape sequences that produce the desired visual styling, or guidance on how to extend the centralized ansi module.

## Failure Modes

- **Nested resets**: A `\x1b[0m` (RESET) inside styled text will cancel ALL active styles, not just the innermost one. When nesting styles (e.g., bold text containing inline code), each segment must re-apply its own styles after any inner RESET.
- **Terminal compatibility**: Not all terminals support all codes. Codes 90-97 (bright colors) and code 3 (italic) may not render in minimal terminals.
- **Module load order in tests**: Since `ansi.ts` evaluates `detectColor()` at module load time, `FORCE_COLOR` must be set *before* the module is first imported. Use a test preload file or set it at the very top of test files before any imports.
- **Single evaluation**: Color detection runs once per process at module load. Changing env vars after import has no effect on the exported constants.

## Scope

Covers SGR codes only (the `\x1b[...m` family). Does not cover cursor movement, screen clearing, or other CSI sequences.

## Body

### Centralized Module: `src/ansi.ts`

All ANSI constants are defined in `src/ansi.ts` and must be imported from there. Do not define inline ANSI escape sequences in consumer files.

The module exports:
- `detectColor(env)` — pure function; returns boolean based on `FORCE_COLOR` > `NO_COLOR` > `isTTY` priority
- `buildCodes(enabled)` — returns an object of all 14 ANSI constants, empty strings when disabled
- `colorEnabled` — module-level boolean result of detection
- 14 named constants: `RESET`, `BOLD`, `ITALIC`, `DIM`, `RED`, `PURPLE`, `GREEN`, `BLUE`, `LIGHT_GREY`, `GREY`, `LIGHT_BLUE`, `YELLOW`, `CYAN`, `GRAY`

### TTY Detection Priority

1. `FORCE_COLOR` env var set → color enabled (regardless of value)
2. `NO_COLOR` env var set → color disabled
3. `process.stdout.isTTY` → color enabled if true, disabled if false/undefined

This follows the conventions of [no-color.org](https://no-color.org/) and popular libraries like chalk.

### Testing with ANSI Constants

In CI environments, stdout is not a TTY, so ANSI constants would be empty strings by default. To get actual escape sequences in test assertions:
- Set `process.env.FORCE_COLOR = "1"` at the top of test files (before any imports from ansi.ts)
- Or use a preload file like `src/__tests__/setup.ts`

### Escape Sequence Format

All SGR codes follow the pattern `\x1b[<code>m` where `<code>` is a number:

| Code | Effect |
|------|--------|
| 0 | Reset all attributes |
| 1 | Bold |
| 2 | Dim (faint) |
| 3 | Italic |
| 30-37 | Standard foreground colors |
| 90-97 | Bright foreground colors |

### Key Gotcha: RESET Clears Everything

There is no "end bold" or "end color" code in practice. `\x1b[0m` resets ALL attributes. Treat each styled span as self-contained with its own RESET, and avoid nesting styles.

## Changes

* 0.1.0 - Added centralized ansi.ts module documentation, TTY detection priority, and testing guidance
* 0.0.1 - Initial version with SGR code reference and nesting gotcha
