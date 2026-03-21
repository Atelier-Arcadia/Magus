import { createOrchestrator } from "./orchestrator";
import { mapOrchestratorEvent, createIdGenerator } from "./ui/mapEvent";
import { parseResumeSessionId, parsePromptFlag, parseAutoApprove, readPrompt } from "./code-helpers";
import type { HistoryEntry } from "./ui/types";
import type { OrchestratorEvent } from "./orchestrator";

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";

// ── Entry formatting ─────────────────────────────────────────────────────────

function formatEntry(entry: HistoryEntry): string {
  switch (entry.kind) {
    case "user_prompt":       return `${YELLOW}❯ ${entry.text}${RESET}`;
    case "assistant_message": return entry.text;
    case "tool_use":          return `${DIM}${entry.text}${RESET}`;
    case "tool_error":        return `${RED}${entry.text}${RESET}`;
    case "stage_status":      return entry.text;
    case "result":            return `${DIM}${entry.text}${RESET}`;
    case "error":             return `${RED}${BOLD}${entry.text}${RESET}`;
    case "info":              return `${DIM}${entry.text}${RESET}`;
    case "phase":             return `${BOLD}── Phase: ${entry.label} ──${RESET}`;
  }
}

// ── Event consumer ───────────────────────────────────────────────────────────

async function drainEvents(
  gen: AsyncGenerator<OrchestratorEvent>,
  nextId: () => string,
  autoApprove: boolean,
): Promise<void> {
  for await (const event of gen) {
    const entries = mapOrchestratorEvent(event, nextId);
    for (const entry of entries) {
      console.log(formatEntry(entry));
    }

    if (event.kind === "plan_approval_request") {
      if (autoApprove) {
        console.log(`${DIM}✓ Plan auto-approved.${RESET}`);
        event.resolve({ approved: true });
      } else {
        const answer = await promptUser(
          `${CYAN}Approve this plan? (y)es / (n)o, or provide feedback:${RESET} `,
        );
        const normalized = answer.trim().toLowerCase();
        if (normalized === "y" || normalized === "yes") {
          event.resolve({ approved: true });
        } else {
          event.resolve({ approved: false, feedback: answer });
        }
      }
    }
  }
}

// ── stdin prompt (for approval) ──────────────────────────────────────────────

function promptUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    process.stdin.once("data", (chunk) => {
      data += chunk;
      process.stdin.pause();
      resolve(data.trimEnd());
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const resumeSessionId = parseResumeSessionId(args);
const promptFile = parsePromptFlag(args);
const autoApprove = parseAutoApprove(args);
const prompt = await readPrompt(promptFile);
const orchestrator = createOrchestrator();
const nextId = createIdGenerator();

console.log(`${GRAY}Running…${RESET}`);

await drainEvents(
  orchestrator.run({ prompt, sessionId: resumeSessionId }),
  nextId,
  autoApprove,
);

process.exit(0);
