/**
 * A simple async channel that merges pushes from multiple concurrent
 * producers into a single async-iterable stream for the consumer.
 */
export type Channel<T> = {
  push(value: T): void;
  close(): void;
  [Symbol.asyncIterator](): AsyncIterator<T>;
};

/** Release any promise currently waiting for the next item or close signal. */
function makeWake(notify: { current: (() => void) | null }): () => void {
  return () => {
    if (notify.current) {
      const fn = notify.current;
      notify.current = null;
      fn();
    }
  };
}

export function createChannel<T>(): Channel<T> {
  const buffer: T[] = [];
  let closed = false;
  const notify: { current: (() => void) | null } = { current: null };
  const wake = makeWake(notify);

  return {
    push(value: T) {
      buffer.push(value);
      wake();
    },

    close() {
      closed = true;
      wake();
    },

    async *[Symbol.asyncIterator]() {
      while (true) {
        while (buffer.length > 0) {
          yield buffer.shift()!;
        }
        if (closed) return;
        await new Promise<void>((resolve) => {
          notify.current = resolve;
        });
      }
    },
  };
}
