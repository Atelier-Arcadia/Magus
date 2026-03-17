import { createOrchestrator } from "./orchestrator";
import { formatToolCall } from "./format-tool-call";
import { parseResumeSessionId, selectSessionId } from "./code-helpers";
import * as readline from "readline";
import { loadConfig } from "./config";

const args = process.argv.slice(2);
const resumeSessionId = parseResumeSessionId(args);

const orchestrator = createOrchestrator();


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const config = loadConfig();
  console.log("Config loaded:", JSON.stringify(config));
  console.log("Magus Coder (type 'exit' to quit)\n");

  let hasResumed = false;

  while (true) {
    const input = await prompt("> ");
    if (input.trim().toLowerCase() === "exit") break;
    if (!input.trim()) continue;

    const sessionId = selectSessionId(resumeSessionId, hasResumed);
    if (sessionId) hasResumed = true;

    for await (const event of orchestrator.run({ prompt: input, sessionId })) {
      switch (event.kind) {
        case "phase_start":
          console.log(
            `\n\u2500\u2500 Phase: ${event.phase} \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`,
          );
          break;

        case "phase_end":
          console.log(
            `\n\u2500\u2500 End: ${event.phase} \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`,
          );
          break;

        case "agent_event": {
          const ae = event.event;
          switch (ae.kind) {
            case "message":
              process.stdout.write(ae.content);
              break;
            case "tool_use":
              console.log(`\n${formatToolCall(ae.tool, ae.input)}`);
              break;
            case "tool_result":
              if (ae.is_error) {
                console.log(`[tool error: ${ae.output}]`);
              }
              break;
            case "result":
              console.log(
                `\n\n(${ae.num_turns} turns, ${ae.duration_ms}ms, $${ae.cost_usd.toFixed(4)})`,
              );
              break;
            case "error":
              console.error(`\nError: ${ae.error}`);
              break;
          }
          break;
        }

        case "plan_approval_request": {
          console.log("\n" + event.renderedPlan + "\n");

          const answer = await prompt(
            "Approve this plan? (y)es / (n)o, provide feedback: ",
          );
          const trimmed = answer.trim().toLowerCase();

          if (trimmed === "y" || trimmed === "yes") {
            event.resolve({ approved: true });
            console.log("\n\u2713 Plan approved.\n");
          } else {
            // Anything other than "y"/"yes" is treated as feedback.
            // If they just said "n"/"no", prompt for the actual feedback.
            let feedback = trimmed;
            if (feedback === "n" || feedback === "no" || feedback === "") {
              feedback = await prompt("What would you like to change? ");
            }
            event.resolve({ approved: false, feedback });
          }
          break;
        }

        case "stage_start":
          console.log(`\n\u25b6 Stage: ${event.stageId}`);
          break;

        case "stage_end":
          if (event.status === "completed") {
            console.log(`\u2713 Stage ${event.stageId} completed`);
          } else {
            console.error(
              `\u2717 Stage ${event.stageId} failed${event.error ? ": " + event.error : ""}`,
            );
          }
          break;

        case "stage_agent_event": {
          const se = event.event;
          switch (se.kind) {
            case "message":
              process.stdout.write(se.content);
              break;
            case "tool_use":
              console.log(`  [${event.stageId}] ${formatToolCall(se.tool, se.input)}`);
              break;
            case "tool_result":
              if (se.is_error) {
                console.log(`  [${event.stageId}] tool error: ${se.output}`);
              }
              break;
            case "result":
              console.log(
                `  [${event.stageId}] (${se.num_turns} turns, ${se.duration_ms}ms, $${se.cost_usd.toFixed(4)})`,
              );
              break;
            case "error":
              console.error(`  [${event.stageId}] error: ${se.error}`);
              break;
          }
          break;
        }

        case "session":
          console.log(`\nSession: ${event.sessionId}`);
          break;

      }
    }

    console.log();
  }

  rl.close();
}

main();
