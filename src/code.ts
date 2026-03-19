import React from "react";
import { render } from "ink";
import { App } from "./ui/App";
import { createOrchestrator } from "./orchestrator";
import { parseResumeSessionId } from "./code-helpers";

const args = process.argv.slice(2);
const resumeSessionId = parseResumeSessionId(args);
const orchestrator = createOrchestrator();

const { unmount, waitUntilExit } = render(
  React.createElement(App, {
    orchestrator,
    resumeSessionId,
    onExit: () => unmount(),
  }),
  { exitOnCtrlC: true },
);

waitUntilExit().then(() => process.exit(0));
