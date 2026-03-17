export type Event = {
  kind: string;
  message: string;
};

export type MessageQueue = {
  push(event: Event): void;
  events: Event[];
};

export function createMessageQueue(): MessageQueue {
  const events: Event[] = [];

  return {
    push(event: Event) {
      events.push(event);
    },
    events,
  };
}

