# Terminal Markdown ANSI Stylization

## Summary

Implemented a markdown-to-ANSI terminal renderer (`stylizeMarkdown`) that transforms markdown syntax into colored, styled terminal output. The pure function processes headings (ATX and setext), bold, italic, inline code, block quotes, fenced code blocks, and links, applying ANSI escape sequences for color and formatting. It was integrated into the CLI's `formatEntry` function to style `assistant_message`, `stage_status`, and `info` entry kinds.

## Key Decisions

- **Pure function design**: `stylizeMarkdown` is a stateless string→string transformation, making it trivially testable and composable.
- **Functional state machine for code blocks**: Used a `RenderState` type with `reduce` over lines to track whether the parser is inside a fenced code block, avoiding mutable state.
- **Setext heading detection via lookahead on previous line**: The reducer carries `lastRawLine` to detect setext-style headings (`===`/`---`) by checking the current line against the previously buffered raw line.
- **Italic underscore word-boundary guard**: Used `(?<!\w)` and `(?!\w)` lookarounds on the italic regex to avoid false positives on identifiers like `my_variable_name`.
- **Inline styles not applied inside code blocks**: The fence toggle prevents any inline markdown processing within fenced code blocks.
- **ANSI constants exported**: Escape codes are exported from `stylize-markdown.ts` so both `format-entry.ts` and tests can reference them without duplication.
- **Integration wraps `info` in DIM**: For `info` entries, `stylizeMarkdown` is applied first, then the whole result is wrapped in `DIM`+`RESET`, layering styles.

## Implementation Details

- **New file**: `src/stylize-markdown.ts` — the core rendering module (~157 lines).
- **New file**: `src/__tests__/stylize-markdown.test.ts` — comprehensive test suite covering all markdown element types and edge cases (~237 lines).
- **Modified file**: `src/format-entry.ts` — imports `stylizeMarkdown` and ANSI constants from the new module; applies stylization to three entry kinds.
- **Heading color scheme**: H1=red, H2=purple, H3=green, H4=blue (all bold).
- **Inline styles**: Bold → bold+light blue, Italic → italic+light blue, Inline code → red, Links → text with light blue URL, Block quotes → grey, Code blocks → light grey content with dimmed fences.

## Outcome

Implementation succeeded. The module is well-tested with 20+ test cases covering plain text passthrough, all heading variants, inline styles, code blocks, mixed content, and edge cases like setext underlines without preceding text. The integration into `formatEntry` is minimal and clean.
