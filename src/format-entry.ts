import { stylizeMarkdown, RESET, BOLD, DIM, RED } from "./stylize-markdown";
import type { HistoryEntry } from "./ui/types";

// ── ANSI constants used only in this module ──────────────────────────────────

const YELLOW = "\x1b[33m";

// ── Entry formatting ─────────────────────────────────────────────────────────

export function formatEntry(entry: HistoryEntry): string {
  switch (entry.kind) {
    case "user_prompt":       return `${YELLOW}❯ ${entry.text}${RESET}`;
    case "assistant_message": return stylizeMarkdown(entry.text);
    case "tool_use":          return `${DIM}${entry.text}${RESET}`;
    case "tool_error":        return `${RED}${entry.text}${RESET}`;
    case "stage_status":      return stylizeMarkdown(entry.text);
    case "result":            return `${DIM}${entry.text}${RESET}`;
    case "error":             return `${RED}${BOLD}${entry.text}${RESET}`;
    case "info":              return `${DIM}${stylizeMarkdown(entry.text)}${RESET}`;
    case "phase":             return `${BOLD}── Phase: ${entry.label} ──${RESET}`;
  }
}
