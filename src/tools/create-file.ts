import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import type { MessageQueue } from "../message-queue";

export function createFileTool(queue: MessageQueue) {
  return tool(
    "CreateFile",
    "Create a new empty file at the given absolute path. Any missing directories in the path will be created automatically.",
    {
      file_path: z.string().describe("Absolute path to the file to create"),
    },
    async ({ file_path }) => {
      queue.push({ kind: "create", message: `creating ${file_path}` });

      try {
        await mkdir(dirname(file_path), { recursive: true });
        await writeFile(file_path, "", { flag: "wx" });
        return {
          content: [{ type: "text" as const, text: `Created file: ${file_path}` }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}

