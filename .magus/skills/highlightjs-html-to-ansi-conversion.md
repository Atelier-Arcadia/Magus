---
name: highlightjs-html-to-ansi-conversion
description: Technique for converting highlight.js HTML output to ANSI terminal escape codes. Use when rendering syntax-highlighted code in a terminal.
---

# Highlight.js HTML to ANSI Conversion

Current version: 0.0.1

Provides a pattern for converting highlight.js HTML span output into ANSI-colored terminal text without additional dependencies.

## Inputs

- HTML string produced by `hljs.highlight()` or `hljs.highlightAuto()` (contains `<span class="hljs-*">` tags and HTML entities)
- An optional base ANSI color to apply as the default/fallback color for the line

## Outputs

A plain string with ANSI escape codes replacing HTML markup, suitable for `console.log()` or terminal rendering.

## Failure Modes

- **Nested spans**: highlight.js can produce nested `<span>` tags (e.g., `<span class="hljs-string"><span class="hljs-subst">...</span></span>`). The regex replacement approach handles `</span>` by resetting to `RESET + lineColor`, which works for simple nesting but may lose the outer span's color for deeply nested structures. This is acceptable for most code.
- **Unknown classes**: Any `hljs-*` class not in the mapping falls back to the line's base color, which is safe but means no distinct highlighting for uncommon token types.
- **HTML entities**: highlight.js escapes `&`, `<`, `>`, `"` as HTML entities. These MUST be decoded after span replacement or the output will contain literal `&amp;` etc.

## Scope

Covers the `hljs-*` CSS class to ANSI color mapping only. Does not cover highlight.js configuration, language registration, or theme customization.

## Body

### Pattern

highlight.js produces HTML like:
```html
<span class="hljs-keyword">const</span> x = <span class="hljs-number">42</span>;
```

Convert to ANSI in two regex passes:

1. **Opening tags**: Replace `<span class="(cls)">` with the ANSI code for that class
2. **Closing tags**: Replace `</span>` with `RESET + baseColor` (to restore the line's default color after each token)

```typescript
html
  .replace(/<span class="([^"]+)">/g, (_, cls) => classToAnsi(cls))
  .replace(/<\/span>/g, `${RESET}${baseColor}`);
```

Then decode HTML entities (`&amp;` → `&`, `&lt;` → `<`, `&gt;` → `>`, `&quot;` → `"`).

### Recommended Class-to-Color Mapping

| hljs class | ANSI color | Notes |
|------------|-----------|-------|
| `hljs-keyword` | Blue | `if`, `const`, `import` etc. |
| `hljs-string` | Green | May override with line color on diff lines |
| `hljs-comment` | Grey | |
| `hljs-number` | Yellow | |
| `hljs-title` | Cyan | Function/class names |
| `hljs-built_in` | Cyan | Built-in functions |
| `hljs-literal` | Yellow | `true`, `false`, `null` |
| `hljs-type` | Purple | Type annotations |

### Import Strategy

Use `highlight.js/lib/common` instead of the full `highlight.js` to load only popular languages (~40 vs ~190), significantly reducing memory usage and startup time. Use `hljs.highlight(code, { language })` when the language is known, `hljs.highlightAuto(code)` as fallback. Always wrap in try/catch — invalid language identifiers throw.

## Changes

* 0.0.1 - Initial version documenting HTML-to-ANSI conversion pattern for highlight.js
