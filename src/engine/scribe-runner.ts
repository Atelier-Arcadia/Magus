import { createScribe } from "../agents/scribe";
import { createMessageQueue } from "./message-queue";

/**
 * Creates a ready-to-call scribe agent function with its own MessageQueue.
 * Extracted into its own module so the orchestrator tests can mock it without
 * contaminating the scribe unit tests which mock at the createAgent level.
 */
export function createScribeRunner() {
  const queue = createMessageQueue();
  return createScribe(queue);
}

