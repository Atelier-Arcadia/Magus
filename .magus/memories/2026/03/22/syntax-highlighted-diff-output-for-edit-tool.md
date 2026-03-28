# Syntax-Highlighted Diff Output for EditFile Tool

## Summary

Added syntax highlighting, line numbers, and color-coded additions/removals to the diff output produced by the EditFile tool. A new module `src/format-diff.ts` was created that parses unified diffs, applies highlight.js syntax highlighting, converts the HTML output to ANSI terminal escape codes, and formats each line with a gutter showing old/new line numbers. The module was integrated into `src/tools/edit.ts` to replace raw diff output with the formatted version.

## Key Decisions

- **highlight.js common subset**: Imported `highlight.js/lib/common` rather than the full library to keep bundle size manageable while covering all popular languages.
- **Functional/immutable diff processing**: The diff state (line counters, output buffer) flows through a reducer pattern using an immutable `DiffState` type, with each line processor returning a new state rather than mutating.
- **HTML-to-ANSI conversion**: Rather than using a library to convert highlight.js HTML to terminal codes, a lightweight regex-based converter maps `<span class="hljs-*">` tags directly to ANSI escape sequences. This avoids an extra dependency.
- **Line color override for hljs-string**: When on an addition (green) or removal (red) line, the `hljs-string` class is overridden to use the line's base color instead of its default green, preventing visual confusion on addition lines.
- **Dual line number gutter**: Additions show only the new file line number, removals show only the old file line number, and context lines show both. Width is pre-computed by scanning all hunk headers.
- **ANSI codes from centralized module**: All color constants come from `src/ansi.ts` to respect TTY detection (no color when piped/non-TTY).

## Implementation Details

- **New file**: `src/format-diff.ts` — exports `formatDiff(diffText, filePath)` as the main entry point, plus several exported helper functions (`getLanguage`, `decodeEntities`, `htmlToAnsi`, `syntaxHighlight`, `parseHunkHeader`).
- **Modified file**: `src/tools/edit.ts` — added `import { formatDiff } from '../format-diff'` and replaced `console.log(diff)` with `console.log(formatDiff(diff, file_path))`.
- **Extension-to-language map**: Covers ~30 file extensions mapping to highlight.js language identifiers. Falls back to `highlightAuto` for unrecognized extensions.
- **HTML entity decoding**: Handles `&amp;`, `&lt;`, `&gt;`, `&quot;` which highlight.js emits in its HTML output.
- **Dependency**: `highlight.js` was added to `package.json` prior to this work.

## Outcome

Implementation completed successfully. Both stages (create module, integrate into edit tool) are marked as completed. The code is well-structured with clear separation of concerns — language detection, syntax highlighting, HTML-to-ANSI conversion, diff parsing, and line rendering are all isolated functions. The functional reducer pattern makes the diff processing logic easy to follow and test.
