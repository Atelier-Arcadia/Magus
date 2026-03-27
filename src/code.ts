import { createOrchestrator } from "./engine/orchestrator";
import { createIdGenerator } from "./ui/mapEvent";
import { parseResumeSessionId, parsePromptFlag, parseAutoApprove, parseHideTools, parseVerbose, parseHelp, readPrompt, drainEvents, promptUser, installSignalHandlers } from "./code-helpers";
import { formatHelp } from "./ui/help";
import { RESET, GRAY, YELLOW } from "./ui/ansi";

// ── Main ─────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (parseHelp(args)) {
  console.log(formatHelp());
  process.exit(0);
}

const resumeSessionId = parseResumeSessionId(args);
const promptFile = parsePromptFlag(args);
const autoApprove = parseAutoApprove(args);
const hideTools = parseHideTools(args);
const verbose = parseVerbose(args);
const prompt = await readPrompt(promptFile);
const orchestrator = createOrchestrator();
const nextId = createIdGenerator();

installSignalHandlers({
  write: (msg) => process.stdout.write(msg),
  exit: (code) => process.exit(code),
  YELLOW,
  RESET,
});

console.log(`${GRAY}Running…${RESET}`);

await drainEvents(
  orchestrator.run({ prompt, sessionId: resumeSessionId }),
  nextId,
  autoApprove,
  hideTools,
  verbose,
);

process.exit(0);
