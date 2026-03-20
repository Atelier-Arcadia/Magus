import React, { useState, useRef, useEffect } from "react";
import { Box, Text } from "ink";
import { MessageHistory } from "./MessageHistory";
import TextInput from "./TextInput";
import { mapOrchestratorEvent, createIdGenerator } from "./mapEvent";
import type { Orchestrator, OrchestratorEvent } from "../orchestrator";
import type { ApprovalResult } from "../prompt-for-approval";
import type { HistoryEntry } from "./types";

// ── Public types ──────────────────────────────────────────────────────────────

export type AppProps = {
  orchestrator: Orchestrator;
  resumeSessionId?: string;
  initialPrompt: string;
  autoApprove?: boolean;
  onExit: () => void;
};

export type ApprovalSubmitResult =
  | { action: "approve"; entry: HistoryEntry }
  | { action: "reject"; entry: HistoryEntry; feedback: string };

// ── Pure helpers ──────────────────────────────────────────────────────────────────────

export function isApprovalYes(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
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

// ── Async event consumer ──────────────────────────────────────────────────────────────────

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

// ── Approval helpers ────────────────────────────────────────────────────────────────────────

function applyApproval(
  result: ApprovalSubmitResult,
  resolve: (r: ApprovalResult) => void,
): void {
  if (result.action === "approve") {
    resolve({ approved: true });
  } else {
    resolve({ approved: false, feedback: result.feedback });
  }
}

function makeApprovalHandler(
  pendingApproval: ((r: ApprovalResult) => void) | null,
  setHistory: React.Dispatch<React.SetStateAction<HistoryEntry[]>>,
  setPendingApproval: React.Dispatch<React.SetStateAction<((r: ApprovalResult) => void) | null>>,
  nextId: () => string,
) {
  return (value: string): void => {
    if (!pendingApproval) return;
    const result = evalApprovalSubmit(value, nextId);
    setHistory((prev) => [...prev, result.entry]);
    applyApproval(result, pendingApproval);
    setPendingApproval(null);
  };
}

function makeOnApproval(
  autoApprove: boolean,
  setPendingApproval: React.Dispatch<React.SetStateAction<((r: ApprovalResult) => void) | null>>,
) {
  return (resolve: (r: ApprovalResult) => void): void => {
    if (autoApprove) {
      resolve({ approved: true });
    } else {
      setPendingApproval(() => resolve);
    }
  };
}

// ── Component ──────────────────────────────────────────────────────────────────────────────────────

export function App({
  orchestrator,
  resumeSessionId,
  initialPrompt,
  autoApprove = false,
  onExit,
}: AppProps): React.JSX.Element {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<((r: ApprovalResult) => void) | null>(null);
  const nextId = useRef(createIdGenerator()).current;
  const handleApproval = makeApprovalHandler(pendingApproval, setHistory, setPendingApproval, nextId);

  useEffect(() => {
    setIsRunning(true);
    void drainOrchestratorRun(
      orchestrator.run({ prompt: initialPrompt, sessionId: resumeSessionId }),
      nextId,
      (entries) => setHistory((prev) => [...prev, ...entries]),
      makeOnApproval(autoApprove, setPendingApproval),
    ).then(() => { setIsRunning(false); onExit(); });
  }, []);

  return (
    <>
      <MessageHistory items={history} />
      {pendingApproval && (
        <>
          <Text color="cyan">Approve this plan? (y)es / (n)o, or provide feedback:</Text>
          <Box>
            <Text color="yellow">{"> "}</Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleApproval}
              isActive={true}
              placeholder=""
            />
          </Box>
        </>
      )}
      {isRunning && !pendingApproval && (
        <Text color="gray">Running…</Text>
      )}
    </>
  );
}
