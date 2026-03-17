import { createAgent } from "./agent";
import { formatToolCall } from "./format-tool-call";
import { editFileTool } from "./tools/edit";
import { createFileTool } from "./tools/create-file";
import { createMessageQueue } from "./message-queue";
import * as readline from "readline";
import { loadConfig } from "./config";

const queue = createMessageQueue();

const assistant = createAgent({
  systemPrompt:
    "You are a helpful, friendly assistant. Be concise and direct in your responses. Use the EditFile tool to make changes to files.",
  tools: ["Read", "Glob", "Grep"],
  mcpTools: [editFileTool(queue), createFileTool(queue)],
});

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
  console.log("Magus Assistant (type 'exit' to quit)\n");

  let sessionId: string | undefined;

  while (true) {
    const input = await prompt("> ");
    if (input.trim().toLowerCase() === "exit") break;
    if (!input.trim()) continue;

    for await (const event of assistant({ prompt: input, sessionId })) {
      switch (event.kind) {
        case "message":
          process.stdout.write(event.content);
          break;
        case "tool_use":
          console.log(`\n${formatToolCall(event.tool, event.input)}`);
          break;
        case "tool_result":
          if (event.is_error) {
            console.log(`[tool error: ${event.output}]`);
          }
          break;
        case "result":
          sessionId = event.session_id;
          console.log(`\n\n(${event.num_turns} turns, ${event.duration_ms}ms, $${event.cost_usd.toFixed(4)})`);
          break;
        case "error":
          if (event.session_id) sessionId = event.session_id;
          console.error(`\nError: ${event.error}`);
          break;
      }
    }

    console.log();

    if (queue.events.length > 0) {
      console.log("Events:", queue.events);
    }
  }

  rl.close();
}

main();

