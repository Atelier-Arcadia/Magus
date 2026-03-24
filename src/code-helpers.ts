import { createReadStream } from "node:fs";
import { mapOrchestratorEvent } from "./ui/mapEvent";
import { formatEntry } from "./ui/format-entry";
import { RESET, DIM, CYAN } from "./ui/ansi";
import type { HistoryEntry } from "./ui/types";
import type { OrchestratorEvent } from "./engine/orchestrator";

/**
 * Parse the value of the `--resume` flag from a CLI args array.
 *
 * @returns The session ID string if `--resume <id>` is present, otherwise `undefined`.
 */
export function parseResumeSessionId(args: string[]): string | undefined {
  const idx = args.indexOf("--resume");
  return idx !== -1 ? args[idx + 1] : undefined;
}

/**
 * Return the session ID to pass into `orchestrator.run()`, but only on the
 * first turn of a resumed session. On all subsequent turns the orchestrator
 * tracks the session internally, so we pass `undefined`.
 *
 * @param resumeSessionId - The session ID from CLI args (may be `undefined`).
 * @param hasResumed      - Whether we have already forwarded the session ID.
 */
export function selectSessionId(
  resumeSessionId: string | undefined,
  hasResumed: boolean,
): string | undefined {
  return !hasResumed && resumeSessionId ? resumeSessionId : undefined;
}

/**
 * Parse the value of the `--prompt` / `-p` flag from a CLI args array.
 * When both forms are present, the one that appears first wins.
 *
 * @returns The prompt-file path string if found, otherwise `undefined`.
 */
export function parsePromptFlag(args: string[]): string | undefined {
  const longIdx = args.indexOf("--prompt");
  const shortIdx = args.indexOf("-p");
  if (longIdx === -1 && shortIdx === -1) return undefined;
  const idx =
    longIdx === -1 ? shortIdx
    : shortIdx === -1 ? longIdx
    : Math.min(longIdx, shortIdx);
  return args[idx + 1];
}

/**
 * Check whether the `--auto-approve` boolean flag is present in a CLI args array.
 *
 * @returns `true` if `--auto-approve` appears exactly (no partial matches).
 */
export function parseAutoApprove(args: string[]): boolean {
  return args.includes("--auto-approve");
}

/**
 * Check whether the `-H` / `--hide-tools` boolean flag is present in a CLI args array.
 *
 * @returns `true` if `-H` or `--hide-tools` appears exactly (no partial matches).
 */
export function parseHideTools(args: string[]): boolean {
  return args.includes("-H") || args.includes("--hide-tools");
}

/**
 * Check whether the `-v` / `--verbose` boolean flag is present in a CLI args array.
 *
 * @returns `true` if `-v` or `--verbose` appears exactly (no partial matches).
 */
export function parseVerbose(args: string[]): boolean {
  return args.includes("-v") || args.includes("--verbose");
}

/**
 * Check whether the `-h` / `--help` boolean flag is present in a CLI args array.
 *
 * @returns `true` if `-h` or `--help` appears exactly (no partial matches).
 */
export function parseHelp(args: string[]): boolean {
  return args.includes("-h") || args.includes("--help");
}

/**
 * Read prompt text from a file path or, when `promptFile` is `undefined`, from stdin.
 * Trims surrounding whitespace from the result.
 *
 * @throws {Error} If the file does not exist, the file is empty, or stdin yields nothing.
 */
export async function readPrompt(promptFile: string | undefined): Promise<string> {
  if (promptFile !== undefined) {
    const file = Bun.file(promptFile);
    if (!(await file.exists()))
      throw new Error(`Prompt file not found: ${promptFile}`);
    const text = (await file.text()).trim();
    if (text.length === 0)
      throw new Error(`Prompt file is empty: ${promptFile}`);
    return text;
  }
  const text = (await Bun.stdin.text()).trim();
  if (text.length === 0) throw new Error("No prompt was provided.");
  return text;
}

// ── Terminal prompt (for approval) ────────────────────────────────────────────────────────────

// Reads directly from /dev/tty instead of process.stdin to avoid
// conflicts with Bun's event loop and stdin stream state management.
export function promptUser(question: string): Promise<string> {
  return new Promise<string>((resolve) => {
    process.stdout.write(question);
    const tty = createReadStream("/dev/tty", { encoding: "utf8" });
    tty.once("data", (chunk) => {
      tty.destroy();
      resolve(String(chunk).trimEnd());
    });
  });
}

// ── Event draining ─────────────────────────────────────────────────────────────

export type DrainEventsDeps = {
  readonly mapOrchestratorEvent: (
    event: OrchestratorEvent,
    nextId: () => string,
    verbose: boolean,
  ) => HistoryEntry[];
  readonly formatEntry: (entry: HistoryEntry) => string;
  readonly RESET: string;
  readonly DIM: string;
  readonly CYAN: string;
};

const defaultDrainEventsDeps: DrainEventsDeps = {
  mapOrchestratorEvent,
  formatEntry,
  RESET,
  DIM,
  CYAN,
};

export async function drainEvents(
  gen: AsyncGenerator<OrchestratorEvent>,
  nextId: () => string,
  autoApprove: boolean,
  hideTools: boolean,
  verbose: boolean,
  deps: DrainEventsDeps = defaultDrainEventsDeps,
): Promise<void> {
  for await (const event of gen) {
    const entries = deps.mapOrchestratorEvent(event, nextId, verbose);
    for (const entry of entries) {
      if (hideTools && (entry.kind === "tool_use" || entry.kind === "tool_error")) {
        continue;
      }
      console.log(deps.formatEntry(entry));
    }

    if (event.kind === "plan_approval_request") {
      if (autoApprove) {
        console.log(`${deps.DIM}✓ Plan auto-approved.${deps.RESET}`);
        event.resolve({ approved: true });
      } else {
        const answer = await promptUser(
          `${deps.CYAN}Approve this plan? (y)es / (n)o, or provide feedback:${deps.RESET} `,
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
