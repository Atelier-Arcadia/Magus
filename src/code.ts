import React from "react";
import { render } from "ink";
import { App } from "./ui/App";
import { createOrchestrator } from "./orchestrator";
import { parseResumeSessionId, parsePromptFlag, parseAutoApprove, readPrompt } from "./code-helpers";

const args = process.argv.slice(2);
const resumeSessionId = parseResumeSessionId(args);
const promptFile = parsePromptFlag(args);
const autoApprove = parseAutoApprove(args);
const prompt = await readPrompt(promptFile);
const orchestrator = createOrchestrator();

const { unmount, waitUntilExit } = render(
  React.createElement(App, {
    orchestrator,
    resumeSessionId,
    initialPrompt: prompt,
    autoApprove,
    onExit: () => unmount(),
  }),
  { exitOnCtrlC: true },
);

waitUntilExit().then(() => process.exit(0));
