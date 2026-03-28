# Remove Ink UI Dependencies and Files

## Summary

Removed all Ink (React-based terminal UI framework) code from the Magus project. This included deleting `.tsx` component files, removing `ink`, `react`, `@types/react`, and related dependencies from `package.json`, cleaning JSX-related configuration from `tsconfig.json`, and updating `MAGUS.md` to reflect the simplified architecture. The non-Ink pure logic files in `src/ui/` (`mapEvent.ts`, `types.ts`) were correctly preserved.

## Key Decisions

- **Preserve `src/ui/mapEvent.ts` and `src/ui/types.ts`**: These files contain pure event-mapping logic with no Ink/React dependencies. They were kept intact since they serve the CLI output pipeline.
- **Two parallel stages**: The deletion of Ink files/deps and the MAGUS.md documentation update were executed concurrently as independent stages since neither depended on the other.
- **No functionality changes**: The removal was purely subtractive — no existing CLI behavior (`src/code.ts`) was modified.

## Implementation Details

- **Deleted files**: All `.tsx` component files (Ink UI components) were removed from the source tree.
- **`package.json` cleanup**: Removed `ink`, `react`, `@types/react`, and any other React/Ink-related dependencies from both `dependencies` and `devDependencies`.
- **`tsconfig.json` cleanup**: Removed `jsx` compiler option and any React-specific TypeScript configuration.
- **`MAGUS.md` update**: Removed references to Ink, React TUI components, and deleted files from the directory structure, dependencies list, and other documentation sections.
- **Remaining `node_modules`**: The `ink` and `react` packages still exist in `node_modules/` as stale artifacts. Running `bun install` or deleting `node_modules` and reinstalling would clean these up.

## Outcome

Implementation succeeded. All Ink/React references are gone from source code, configuration, and documentation. The project compiles and runs with only its core dependencies (`@anthropic-ai/claude-agent-sdk`, `diff`, `yaml`). No existing functionality was broken.
