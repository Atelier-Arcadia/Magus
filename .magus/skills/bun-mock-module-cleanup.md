---
name: bun-mock-module-cleanup
description: Explains how Bun's mock.module() leaks across test files, the required cleanup pattern, and when to prefer dependency injection instead. Use when writing or debugging Bun tests that use module mocking.
---

# Bun mock.module Cleanup

Current version: 0.0.2

Bun's `mock.module()` replaces module resolution at the process level, meaning mocks defined in one test file persist into other test files unless explicitly cleaned up.

## Inputs

A test file that uses `mock.module()` from `bun:test` to replace one or more module imports.

## Outputs

Correct mock isolation: mocks apply only to the test file that defines them and do not contaminate other files in the same test run.

## Failure Modes

- **Leaked mocks**: If `mock.restore()` is not called, other test files that import the same modules will receive the mocked versions instead of the real ones. This produces confusing failures in unrelated test files (e.g., functions returning `undefined` or wrong types).
- **Premature restore**: Calling `mock.restore()` in `beforeEach` or `afterEach` instead of `afterAll` will break tests within the same file that depend on the mock, since `mock.module()` is hoisted and applies file-wide.
- **Ordering sensitivity**: Because Bun may run test files in any order, leaked mocks cause non-deterministic failures that appear or disappear depending on file execution order.

## Scope

Applies only to Bun's test runner (`bun:test`). Does not apply to Jest, Vitest, or Node's built-in test runner, which have different mock scoping semantics.

## Body

### The Pattern

Every test file that uses `mock.module()` must include:

```typescript
import { afterAll, mock } from "bun:test";

// mock.module() calls (hoisted by Bun)
mock.module("some-module", () => ({ ... }));

// REQUIRED: restore after all tests in this file
afterAll(() => { mock.restore(); });
```

### Why This Matters

`mock.module()` is hoisted before imports by Bun's test transformer. It replaces the module in Bun's resolution cache globally. Unlike `spyOn()` which patches individual bindings, `mock.module()` affects every subsequent `import` or `require()` of that module path across the entire process.

`mock.restore()` reverses all `mock.module()` replacements, restoring the original modules. It should be called in `afterAll` (not `afterEach`) because the mocks need to remain active for all tests within the declaring file.

### Prefer Dependency Injection Over mock.module()

When a function under test calls other internal modules (not external/system modules), consider making those dependencies injectable rather than using `mock.module()`. This avoids the leak problem entirely.

```typescript
// Production code: optional deps param with defaults
export type MyFuncDeps = {
  readonly helperFn: (arg: string) => string;
  readonly CONSTANT: string;
};

const defaultDeps: MyFuncDeps = { helperFn, CONSTANT };

export function myFunc(input: string, deps: MyFuncDeps = defaultDeps) {
  return deps.helperFn(input) + deps.CONSTANT;
}

// Test code: no mock.module() needed
const testDeps: MyFuncDeps = {
  helperFn: (x) => `[${x}]`,
  CONSTANT: "<TEST>",
};
myFunc("hello", testDeps);
```

Reserve `mock.module()` for cases where DI is impractical (e.g., system modules like `node:fs`, deeply nested transitive dependencies, or modules consumed by code you don't control).

### Diagnosing Mock Leaks

If tests pass in isolation (`bun test path/to/file.test.ts`) but fail when run together (`bun test`), suspect mock leaking. Look for test files with `mock.module()` that lack a corresponding `mock.restore()` call.

## Changes

* 0.0.2 - Added dependency injection as preferred alternative to mock.module() for internal module dependencies, based on drainEvents refactoring experience.
* 0.0.1 - Initial version documenting Bun mock.module() leak pattern and afterAll cleanup requirement.
