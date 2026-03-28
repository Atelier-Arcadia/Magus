# Remove magus.yml Configuration File

## Summary

Removed all references to the `magus.yml` configuration file, its associated `config.ts` module, test file, and the `yaml` package dependency. The configuration system was no longer needed and was fully excised from the codebase and documentation.

## Key Decisions

- **Complete removal over deprecation**: Rather than deprecating the config system, all traces were removed in a single sweep across code, tests, docs, and dependencies.
- **Three parallel/sequential stages**: The work was split into three stages — removing config code (no deps), updating MAGUS.md docs (no deps), and removing the yaml dependency (dependent on config code removal).
- **Files emptied rather than deleted**: The coder agent lacks a file deletion tool, so `magus.yml`, `src/config.ts`, and `src/__tests__/config.test.ts` were emptied to blank files rather than fully deleted from disk.

## Implementation Details

- **`magus.yml`**: Root config file emptied (was the user-facing configuration file).
- **`src/config.ts`**: Config module emptied (contained `MagusConfig` type and YAML parsing logic).
- **`src/__tests__/config.test.ts`**: Test file emptied.
- **`src/assistant.ts`**: Config import and usage removed.
- **`MAGUS.md`**: All references to `magus.yml`, `config.ts`, `MagusConfig`, and the `yaml` dependency removed. The dependencies line now lists only `@anthropic-ai/claude-agent-sdk`, `diff`, `zod`.
- **`package.json`**: The `yaml` package removed from dependencies.

## Outcome

The implementation succeeded functionally — no remaining imports, references, or usages of the config system exist in the codebase. The `yaml` dependency is gone from `package.json`. The only minor gap is that three files (`magus.yml`, `src/config.ts`, `src/__tests__/config.test.ts`) remain on disk as empty files and should be manually deleted with `rm`.
