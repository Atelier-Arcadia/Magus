import { BOLD, CYAN, DIM, RESET, YELLOW, GREEN } from "./ansi";

// ── Section builders ─────────────────────────────────────────────────────────────

const heading = (text: string): string =>
  `${BOLD}${CYAN}${text}${RESET}`;

const flag = (short: string, long: string, description: string): string =>
  `  ${GREEN}${short ? short + ", " : "    "}${long}${RESET}  ${DIM}${description}${RESET}`;

const example = (cmd: string): string =>
  `  ${DIM}${cmd}${RESET}`;

// ── Section content ──────────────────────────────────────────────────────────

const headerSection = (): string =>
  `${BOLD}${CYAN}Magus${RESET}  ${DIM}AI-powered software development agent${RESET}`;

const howItWorksSection = (): string => [
  heading("How it works"),
  `  ${YELLOW}plan${RESET} → ${YELLOW}approve${RESET} → ${YELLOW}execute${RESET} → ${YELLOW}scribe${RESET}`,
  "",
  `  ${DIM}Planner (Claude Opus) decomposes your prompt into a DAG of stages.${RESET}`,
  `  ${DIM}You review and approve the plan before any code is touched.${RESET}`,
  `  ${DIM}Concurrent Coder agents (Claude Sonnet) execute each stage.${RESET}`,
  `  ${DIM}Scribe (Claude Opus) documents learnings for future sessions.${RESET}`,
].join("\n");

const usageSection = (): string => [
  heading("Usage"),
  example("echo 'your prompt' | bun src/code.ts [flags]"),
  example("bun src/code.ts -p prompt.txt [flags]"),
  example("bun src/code.ts --prompt prompt.txt [flags]"),
  example("bun src/code.ts --resume <session-id> [flags]"),
].join("\n");

const flagsSection = (): string => [
  heading("Flags"),
  flag("",     "--resume <id>",    "Resume a previous session by its ID"),
  flag("-p",   "--prompt <file>",  "Read prompt from a file instead of stdin"),
  flag("",     "--auto-approve",   "Skip interactive plan approval"),
  flag("-H",   "--hide-tools",     "Suppress tool call output"),
  flag("-v",   "--verbose",        "Show full plan details with dependencies"),
  flag("-h",   "--help",           "Print this help message and exit"),
].join("\n");

const promptSection = (): string => [
  heading("Providing a prompt"),
  example("# Pipe from echo"),
  example("echo 'Add a README' | bun src/code.ts"),
  "",
  example("# Read from a file (-p / --prompt)"),
  example("bun src/code.ts -p my-task.txt"),
  "",
  example("# Heredoc"),
  example("bun src/code.ts << 'EOF'"),
  example("Refactor the auth module to use JWTs"),
  example("EOF"),
].join("\n");

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Return a fully-styled, multi-section help string for the `magus` CLI.
 * Uses ANSI constants from `./ansi.ts`; falls back to plain text when colors
 * are disabled (e.g. in CI / non-TTY environments).
 */
export function formatHelp(): string {
  return [
    "",
    headerSection(),
    "",
    howItWorksSection(),
    "",
    usageSection(),
    "",
    flagsSection(),
    "",
    promptSection(),
    "",
  ].join("\n");
}
