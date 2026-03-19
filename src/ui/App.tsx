import React, { useState, useRef } from "react";
import { Box, Text } from "ink";
import { MessageHistory } from "./MessageHistory";
import TextInput from "./TextInput";
import { mapOrchestratorEvent, createIdGenerator } from "./mapEvent";
import { selectSessionId } from "../code-helpers";
import type { Orchestrator, OrchestratorEvent } from "../orchestrator";
import type { ApprovalResult } from "../prompt-for-approval";
import type { HistoryEntry } from "./types";

// ── Public types ────────────────────────────────────────────────────────────────

export type AppProps = {
  orchestrator: Orchestrator;
  resumeSessionId?: string;
  onExit: () => void;
};

type Mode = "prompt" | "approval";

// ── Pure action types ─────────────────────────────────────────────────────────

export type PromptSubmitResult =
  | { action: "exit" }
  | { action: "noop" }
  | { action: "run"; entry: HistoryEntry; sessionId: string | undefined };

export type ApprovalSubmitResult =
  | { action: "approve"; entry: HistoryEntry }
  | { action: "reject"; entry: HistoryEntry; feedback: string };

// ── Pure helpers ───────────────────────────────────────────────────────────────

export function isApprovalYes(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}

export function evalPromptSubmit(
  input: string,
  resumeSessionId: string | undefined,
  hasResumed: boolean,
  nextId: () => string,
): PromptSubmitResult {
  if (input === "exit") return { action: "exit" };
  if (!input) return { action: "noop" };
  return {
    action: "run",
    entry: { kind: "user_prompt", id: nextId(), text: input },
    sessionId: selectSessionId(resumeSessionId, hasResumed),
  };
}

export function evalApprovalSubmit(
  input: string,
  nextId: () => string,
): ApprovalSubmitResult {
  const id = nextId();
  if (isApprovalYes(input)) {
    return { action: "approve", entry: { kind: "info", id, text: "✓ Plan approved." } };
  }
  return { action: "reject", entry: { kind: "info", id, text: "✗ Plan rejected." }, feedback: input };
}

// ── Async event consumer ────────────────────────────────────────────────────────

export async function drainOrchestratorRun(
  gen: AsyncGenerator<OrchestratorEvent>,
  nextId: () => string,
  onEntries: (entries: HistoryEntry[]) => void,
  onApproval: (resolve: (result: ApprovalResult) => void) => void,
): Promise<void> {
  for await (const event of gen) {
    const entries = mapOrchestratorEvent(event, nextId);
    if (entries.length > 0) onEntries(entries);
    if (event.kind === "plan_approval_request") onApproval(event.resolve);
  }
}

// ── Submit handlers ─────────────────────────────────────────────────────────────

type AppState = {
  history: HistoryEntry[];
  isRunning: boolean;
  mode: Mode;
  hasResumed: boolean;
  pendingApproval: ((result: ApprovalResult) => void) | null;
};

type AppSetters = {
  setHistory: React.Dispatch<React.SetStateAction<HistoryEntry[]>>;
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  setHasResumed: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingApproval: React.Dispatch<React.SetStateAction<((r: ApprovalResult) => void) | null>>;
};

function makeApprovalHandler(state: AppState, setters: AppSetters, nextId: () => string) {
  return (value: string): void => {
    if (!state.pendingApproval) return;
    const result = evalApprovalSubmit(value, nextId);
    setters.setHistory((prev) => [...prev, result.entry]);
    if (result.action === "approve") {
      state.pendingApproval({ approved: true });
    } else {
      state.pendingApproval({ approved: false, feedback: result.feedback });
    }
    setters.setMode("prompt");
    setters.setPendingApproval(null);
  };
}

function makePromptHandler(
  state: AppState,
  setters: AppSetters,
  nextId: () => string,
  orchestrator: Orchestrator,
  resumeSessionId: string | undefined,
  onExit: () => void,
) {
  return (value: string): void => {
    const result = evalPromptSubmit(value, resumeSessionId, state.hasResumed, nextId);
    if (result.action === "exit") { onExit(); return; }
    if (result.action === "noop") return;
    setters.setHistory((prev) => [...prev, result.entry]);
    setters.setIsRunning(true);
    setters.setHasResumed(true);
    void drainOrchestratorRun(
      orchestrator.run({ prompt: value, sessionId: result.sessionId }),
      nextId,
      (entries) => setters.setHistory((prev) => [...prev, ...entries]),
      (resolve) => { setters.setPendingApproval(() => resolve); setters.setMode("approval"); },
    ).then(() => setters.setIsRunning(false));
  };
}

// ── Component ──────────────────────────────────────────────────────────────────────

export function App({ orchestrator, resumeSessionId, onExit }: AppProps): React.JSX.Element {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("prompt");
  const [isRunning, setIsRunning] = useState(false);
  const [hasResumed, setHasResumed] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<((r: ApprovalResult) => void) | null>(null);
  const nextId = useRef(createIdGenerator()).current;

  const state: AppState = { history, isRunning, mode, hasResumed, pendingApproval };
  const setters: AppSetters = { setHistory, setIsRunning, setMode, setHasResumed, setPendingApproval };

  const handleApproval = makeApprovalHandler(state, setters, nextId);
  const handlePrompt = makePromptHandler(state, setters, nextId, orchestrator, resumeSessionId, onExit);
  const handleSubmit = (value: string) =>
    mode === "approval" ? handleApproval(value) : handlePrompt(value);

  const inputActive = !isRunning || mode === "approval";

  return (
    <>
      <MessageHistory items={history} />
      {mode === "approval" && (
        <Text color="cyan">Approve this plan? (y)es / (n)o, or provide feedback:</Text>
      )}
      <Box>
        <Text color="yellow">{inputActive ? "> " : ""}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          isActive={inputActive}
          placeholder="Enter a prompt..."
        />
      </Box>
    </>
  );
}
