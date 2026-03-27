---
name: process-global-dependency-injection
description: Pattern for making functions that use Node.js process globals (signals, stdout, exit) testable via dependency injection. Use when adding code that interacts with process-level APIs.
---

# Process Global Dependency Injection

Current version: 0.0.1

Provides a consistent pattern for wrapping Node.js process-level side effects behind injectable dependencies, enabling unit testing without mocking globals.

## Inputs

- A function that needs to call `process.exit`, `process.stdout.write`, `process.on`/`process.off` for signals, or similar process-level APIs.

## Outputs

- A deps type capturing the process APIs as callbacks.
- A function accepting that deps object, with real values supplied at the call site in `code.ts`.
- A cleanup/teardown function returned for removing listeners or timers.

## Failure Modes

- **Forgetting cleanup**: Signal handlers and timers leak if the returned cleanup function is not called. Always store and invoke it.
- **Over-abstracting**: Only inject the specific process APIs actually used. Don't create a generic "process" dependency bag.
- **Timer leaks in tests**: When `setTimeout` is involved, tests must either use short timeouts with real timers or call cleanup to clear pending timers.

## Scope

Applies to any code in `src/code-helpers.ts` or similar modules that touches process-level Node.js APIs. Does not cover higher-level abstractions like HTTP servers.

## Body

### The Pattern

1. **Define a deps type** with readonly callback fields for each process API used:

```typescript
export type MyFeatureDeps = {
  readonly write: (message: string) => void;
  readonly exit: (code: number) => void;
  readonly YELLOW: string;
  readonly RESET: string;
  readonly timeoutMs?: number;  // optional with sensible default
};
```

2. **Accept deps as the sole parameter** and return a cleanup function:

```typescript
export function installMyFeature(deps: MyFeatureDeps): () => void {
  const handler = (): void => { deps.write("..."); };
  process.on("SIGINT", handler);
  return () => { process.off("SIGINT", handler); };
}
```

3. **Wire in `code.ts`** with real implementations:

```typescript
installMyFeature({
  write: (msg) => process.stdout.write(msg),
  exit: (code) => process.exit(code),
  YELLOW, RESET,
});
```

4. **Test with plain callbacks** — no mocking needed:

```typescript
const writes: string[] = [];
const cleanup = installMyFeature({
  write: (msg) => writes.push(msg),
  exit: () => {},
  YELLOW: "", RESET: "",
});
try {
  process.emit("SIGINT");
  expect(writes).toHaveLength(1);
} finally {
  cleanup();
}
```

### Key Conventions in This Codebase

- ANSI color codes (`YELLOW`, `RESET`, etc.) are injected as string deps rather than imported inside the function, keeping the function pure.
- Optional numeric config (like timeout durations) use `??` defaulting: `const ms = deps.timeoutMs ?? 3000;`
- `process.emit("SIGINT")` works in tests to simulate signals without killing the process.

## Changes

* 0.0.1 - Initial version based on `installSignalHandlers` pattern in code-helpers.ts
