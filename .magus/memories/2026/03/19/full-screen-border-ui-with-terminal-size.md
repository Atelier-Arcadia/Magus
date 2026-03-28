# Full-Screen Border UI with Terminal Size Hook



## Summary



The first step of the magus full UI build was completed: the app now occupies the entire terminal viewport and is wrapped in a manually drawn rounded border with the label "magus" embedded in the top-left of the border. This required a custom terminal-size hook that reacts to resize events, a hand-crafted `BorderBox` component using Unicode box-drawing characters (since Ink's native `borderStyle="round"` does not support labels), and integration of both into the root `App` component.



## Key Decisions



- **Manual box-drawing instead of Ink's built-in border**: Ink's `<Box borderStyle="round">` has no label support. The solution draws the border manually using Unicode characters (`╭ ╮ ╰ ╯ ─ │`) composed into `<Text>` and `<Box>` elements within a vertical flex column.

- **Pure helper functions extracted for testability**: `buildTopBorder(width, label?)` and `buildBottomBorder(width)` are exported standalone functions so they can be unit-tested without rendering any React components.

- **Label truncation strategy**: The top border reserves 4 characters of overhead (`─ ` prefix + ` ` suffix + at least `─` before `╮`). Labels longer than `inner - 4` are truncated via `String.slice`. If the width is too small for even a 1-char label (inner ≤ 4), the label is omitted entirely and plain horizontal dashes fill the space.

- **`useTerminalSize` defaults gracefully in test environments**: Ink's `useStdout` returns a mock `stdout` object without `columns`/`rows` in `renderToString` contexts. The hook falls back to `80 × 24`, which means border rendering tests work without any mocking.

- **Resize reactivity via `stdout` event listener**: The hook attaches/detaches an `onResize` listener inside a `useEffect` that depends on `stdout`, correctly cleaning up on unmount.



## Implementation Details



### New files



| File | Purpose |

|---|---|

| `src/ui/useTerminalSize.ts` | Custom hook; reads `stdout.columns` / `stdout.rows`, re-renders on `"resize"` events |

| `src/ui/BorderBox.tsx` | `BorderBox` component + exported `buildTopBorder` / `buildBottomBorder` pure helpers |

| `src/__tests__/BorderBox.test.tsx` | Unit tests: pure helper invariants (length, corners, label placement, truncation, edge cases) + component render assertions |



### Modified files



| File | Change |

|---|---|

| `src/ui/App.tsx` | Imported `useTerminalSize` and `BorderBox`; added `const { columns, rows } = useTerminalSize();`; replaced root fragment `<> ... </>` with `<BorderBox width={columns} height={rows} label="magus">` |

| `src/__tests__/App.test.tsx` | Added six new render assertions under "BorderBox integration" verifying all five border-character types (`╭ ╮ ╰ ╯ │`) and the `"magus"` label appear in rendered output; all existing pure-function and rendering tests are unchanged |



### Notable patterns



- `BorderBox` layout: outer `<Box flexDirection="column">` → top `<Text>` → middle `<Box height={height-2}>` (left `│` + `flexGrow={1}` children container + right `│`) → bottom `<Text>`.

- The content area uses `height - 2` to account for the top and bottom border rows.



## Outcome



**Success.** Both stages completed without issues. All new files are present and match the plan specification. The `useTerminalSize` hook, `BorderBox` component, its pure helper functions, and the updated `App` component are all correctly implemented. Tests cover pure-function invariants extensively (width correctness across a range of values, label placement, truncation, edge cases) and component rendering (all five box-drawing character types, label presence, children rendered inside the box, top/bottom borders on distinct lines).

