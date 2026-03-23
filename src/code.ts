import { createOrchestrator } from "./engine/orchestrator";
import { createIdGenerator } from "./ui/mapEvent";
import { parseResumeSessionId, parsePromptFlag, parseAutoApprove, parseHideTools, parseVerbose, readPrompt, drainEvents, promptUser } from "./code-helpers";
import { RESET, GRAY } from "./ui/ansi";

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const resumeSessionId = parseResumeSessionId(args);
const promptFile = parsePromptFlag(args);
const autoApprove = parseAutoApprove(args);
const hideTools = parseHideTools(args);
const verbose = parseVerbose(args);
const prompt = await readPrompt(promptFile);
const orchestrator = createOrchestrator();
const nextId = createIdGenerator();

console.log(`${GRAY}Running…${RESET}`);

await drainEvents(
  orchestrator.run({ prompt, sessionId: resumeSessionId }),
  nextId,
  autoApprove,
  hideTools,
  verbose,
);

process.exit(0);
