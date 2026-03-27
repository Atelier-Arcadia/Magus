---
name: async-generator-yield-star-return
description: Explains how to use `yield*` with async generators that return values to compose pipelines that both stream events and produce results. Use when decomposing async generators into smaller functions.
---

# Async Generator yield* Delegation with Return Values

Current version: 0.0.1

TypeScript async generators can both yield events and return a final value. When composed with `yield*`, the return value flows back to the caller while all yielded values pass through transparently. This enables decomposing large generators into smaller ones without losing either streaming or result semantics.

## Inputs

A scenario where an async generator needs to be split into sub-generators that both emit events and produce a result (e.g., a planning loop that streams agent events while ultimately producing an approved plan).

## Outputs

Composed async generators where `yield*` delegates both event streaming and result propagation without mutable shared state.

## Failure Modes

- **Forgetting the return type parameter**: `AsyncGenerator<YieldType>` defaults `TReturn` to `undefined`. You must specify `AsyncGenerator<YieldType, ReturnType>` for the return value to be typed.
- **Using `for await...of` instead of `yield*`**: `for await (const x of gen())` discards the generator's return value. Only `yield*` or manual `.next()` calls can capture it.
- **Void return in caller**: The calling generator must itself be typed with a compatible return type, or assign the result with `const result = yield* subGen()`.

## Scope

Covers the TypeScript/JavaScript `yield*` delegation pattern for async generators specifically. Does not cover synchronous generators (same principle applies) or other generator composition techniques like merging concurrent streams.

## Body

### Pattern

```typescript
// Sub-generator: yields events, returns a result
async function* fetchAndParse(
  url: string,
): AsyncGenerator<ProgressEvent, ParsedData> {
  yield { kind: "start", url };
  const raw = await fetch(url);
  yield { kind: "downloaded", bytes: raw.length };
  const parsed = parse(raw);
  return parsed; // This is the TReturn value
}

// Caller: captures the return value via yield*
async function* pipeline(): AsyncGenerator<ProgressEvent> {
  const data = yield* fetchAndParse("https://example.com");
  //    ^^^^ typed as ParsedData
  //    All ProgressEvents from fetchAndParse are yielded through
  yield { kind: "done", items: data.length };
}
```

### Key Points

1. **`yield*` is the composition operator**: It forwards all yielded values from the sub-generator to the outer consumer, and captures the sub-generator's `return` value as its expression result.
2. **Type signature**: `AsyncGenerator<TYield, TReturn, TNext>`. The second parameter is the return type. Default is `undefined`.
3. **Threading state without mutation**: Instead of mutable closure variables shared across phases, each sub-generator returns its results. The caller destructures and passes to the next phase. This produces a functional pipeline.
4. **Practical use**: Decompose a large orchestration generator into phase functions (`planningLoop`, `executionPhase`, etc.) where each yields streaming events and returns phase-specific results.

## Changes

* 0.0.1 - Initial version documenting async generator yield* delegation with return values for pipeline composition
