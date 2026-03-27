---
name: typescript-file-move-import-update
description: Procedure for safely moving TypeScript files to a new directory and updating all relative import paths. Use when reorganizing directory structure in a TS project.
---

# TypeScript File Move & Import Update

Current version: 0.0.1

A systematic procedure for relocating TypeScript source files into a new directory while keeping all relative imports correct across the codebase.

## Inputs

- A list of files to move and their destination directory.
- Knowledge of which other files import the moved modules.

## Outputs

- Files relocated to the new directory.
- All `import`/`export` statements and `mock.module()` paths updated throughout the codebase.
- Documentation referencing old paths updated.

## Failure Modes

- **Missed consumer**: A file importing a moved module is not updated, causing a build error. **Recovery**: Run `tsc --noEmit` or grep for the old import path to find stragglers.
- **Incorrect depth adjustment**: Relative paths gain or lose a `../` segment incorrectly. **Recovery**: The TypeScript compiler will report the error immediately; fix the path.
- **Mock paths in tests**: Test files using `mock.module("../../src/foo")` with string paths (not import resolution) are easy to miss. **Recovery**: Grep for the module name in test directories specifically.
- **Re-export barrels**: If an `index.ts` barrel re-exports moved modules, it must also be updated or relocated.

## Scope

Applies to any TypeScript (or JavaScript with ESM imports) project using relative import paths. Does not cover path-alias remapping (e.g., `@/` or `tsconfig paths`) or monorepo cross-package moves.

## Body

### Procedure

1. **Create the destination directory** if it doesn't exist.

2. **Move files in dependency order.** Move foundational modules first (types, utilities) before modules that import them, so that intra-group imports can be verified at each step.

3. **Update imports inside moved files.** For each moved file, adjust relative imports:
   - Imports to *other moved files* in the same destination directory: depth stays the same (e.g., `./channel` remains `./channel`).
   - Imports to *non-moved files* outside the destination: add one `../` per directory level moved deeper (e.g., `./agent` becomes `../agent` when moving one level down).

4. **Update imports in consumer files.** For each non-moved file that imports a moved module:
   - Insert the new subdirectory into the path (e.g., `./orchestrator` becomes `./engine/orchestrator`).
   - For files already in subdirectories (e.g., `src/ui/`), the adjustment is relative to their own depth.

5. **Update test mock paths.** Test files often use string-based mock paths (`mock.module("../../src/foo")`) that bypass TypeScript resolution. Grep for the old module names in test directories.

6. **Update documentation and skills.** Grep for old file paths in `.md` files and update them.

### Verification Checklist

- `tsc --noEmit` passes (or the project's equivalent type-check).
- Grep for old path fragments (e.g., `from './orchestrator'`) returns zero results outside the engine directory.
- Tests pass.

### Tips

- **Parallel-safe stages**: Moving files and updating their internal imports can be one stage; updating external consumers, tests, and docs can be parallel follow-up stages since they don't depend on each other.
- **Relative path arithmetic**: When a file moves N levels deeper, add N `../` segments to its imports of non-moved modules. When a file moves N levels shallower, remove N `../` segments.

## Changes

* 0.0.1 - Initial version based on src/engine/ directory restructuring
