---
name: cli-flag-parser-pattern
description: Documents the standard pattern for adding CLI boolean and value flags in `src/code-helpers.ts`, including testing conventions. Use when adding new CLI options to Magus.
---

# CLI Flag Parser Pattern

Current version: 1.2.0

Provides a consistent, tested pattern for adding new CLI flags to the Magus agent runner.

## Inputs

- The flag's long form (e.g. `--verbose`) and optional short form (e.g. `-v`)
- Whether it's a boolean flag or a value flag (takes the next argument)

## Outputs

- An exported parser function in `src/code-helpers.ts`
- Tests in `src/__tests__/code.test.ts`
- The parsed value wired into `code.ts` and threaded to consumers

## Failure Modes

- **Forgetting to thread through callers**: Adding the parser but not passing the value through `drainEvents` or other consumers. Always trace the call chain.
- **Short flag collision**: Check existing short flags (`-p` for prompt, `-H` for hide-tools, `-v` for verbose, `-h` for help) before choosing a new one.

## Scope

Covers `code-helpers.ts` parser functions and their integration into `code.ts`.

## Body

### Boolean Flag Pattern

For flags that are present/absent (no value argument):

```typescript
// src/code-helpers.ts
export function parseFlagName(args: string[]): boolean {
  return args.includes("-X") || args.includes("--flag-name");
}
```

Existing examples: `parseAutoApprove` (long only), `parseHideTools` (-H/--hide-tools), `parseVerbose` (-v/--verbose), `parseHelp` (-h/--help).

### Value Flag Pattern

For flags that consume the next argument:

```typescript
export function parseFlagName(args: string[]): string | undefined {
  const longIdx = args.indexOf("--flag-name");
  const shortIdx = args.indexOf("-x");
  if (longIdx === -1 && shortIdx === -1) return undefined;
  const idx = longIdx === -1 ? shortIdx : shortIdx === -1 ? longIdx : Math.min(longIdx, shortIdx);
  return args[idx + 1];
}
```

Existing examples: `parseResumeSessionId` (long only), `parsePromptFlag` (-p/--prompt).

### Test Convention

Each parser gets a `describe` block in `src/__tests__/code.test.ts` with these standard cases:

1. Returns expected value when long flag is present
2. Returns expected value when short flag is present (if applicable)
3. Returns false/undefined when flag is absent
4. Works alongside other flags
5. Does NOT match partial strings (e.g. `--verbose-mode` should not match `--verbose`)
6. Does NOT match wrong case for short flags (e.g. `-V` vs `-v`)

### Threading Convention

1. Parse in `code.ts` main block (after `process.argv.slice(2)`)
2. Pass as parameter to `drainEvents`
3. `drainEvents` passes to `mapOrchestratorEvent` or uses directly
4. Functions receiving the flag should use `= false` or `= undefined` defaults for backward compatibility

## Changes

* 1.0.0 - Initial version documenting boolean and value flag patterns, test conventions, and threading approach
* 1.1.0 - Removed references to Ink UI app (App.tsx) after Ink was removed from the project
* 1.2.0 - Added `-h` for help to the short flag collision list and `parseHelp` to boolean flag examples
