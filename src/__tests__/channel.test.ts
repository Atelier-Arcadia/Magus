import { describe, expect, test } from "bun:test";
import { createChannel } from "../engine/channel";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Drain an async iterable into an array. */
async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const value of source) {
    items.push(value);
  }
  return items;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("createChannel", () => {
  test("push then close yields the pushed value", async () => {
    const ch = createChannel<number>();
    ch.push(1);
    ch.close();

    const items = await collect(ch);

    expect(items).toEqual([1]);
  });

  test("multiple pushes before consumption are buffered in order", async () => {
    const ch = createChannel<string>();
    ch.push("a");
    ch.push("b");
    ch.push("c");
    ch.close();

    const items = await collect(ch);

    expect(items).toEqual(["a", "b", "c"]);
  });

  test("close after push drains remaining buffered items before terminating", async () => {
    const ch = createChannel<number>();
    ch.push(10);
    ch.push(20);
    ch.close();

    const items = await collect(ch);

    expect(items).toHaveLength(2);
    expect(items[0]).toBe(10);
    expect(items[1]).toBe(20);
  });

  test("close with empty buffer terminates iteration immediately", async () => {
    const ch = createChannel<number>();
    ch.close();

    const items = await collect(ch);

    expect(items).toEqual([]);
  });

  test("push after close does not throw", () => {
    const ch = createChannel<number>();
    ch.close();

    expect(() => ch.push(99)).not.toThrow();
  });

  test("values pushed asynchronously after iteration starts are received", async () => {
    const ch = createChannel<number>();

    // Push values on the next tick, after the consumer has started waiting.
    setTimeout(() => {
      ch.push(7);
      ch.push(8);
      ch.close();
    }, 0);

    const items = await collect(ch);

    expect(items).toEqual([7, 8]);
  });
});
