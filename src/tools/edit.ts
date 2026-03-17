import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { readFile, writeFile } from "fs/promises";
import { createPatch } from "diff";
import type { MessageQueue } from "../message-queue";

export function editFileTool(queue: MessageQueue) {
  return tool(
    "EditFile",
    [
      "Edit a file by replacing a range of lines with new content.",
      "The range is a [start, end) pair of 1-based line numbers (start inclusive, end exclusive).",
      "",
      "Examples:",
      "  Insert before line 5:        range: [5, 5], text: ['new line']",
      "  Delete lines 3-5:            range: [3, 6], text: []",
      "  Replace lines 10-12:         range: [10, 13], text: ['replaced']",
      "  Append to end of file:       range: [lineCount + 1, lineCount + 1], text: ['last line']",
    ].join("\n"),
    {
      file_path: z.string().describe("Absolute path to the file to edit"),
      range: z
        .tuple([z.number().int(), z.number().int()])
        .describe(
          "1-based [start, end) line range. start is inclusive, end is exclusive.",
        ),
      text: z
        .array(z.string())
        .describe("Replacement lines. Empty array to delete the range."),
    },
    async ({ file_path, range, text }) => {
      queue.push({ kind: "edit", message: `modifying ${file_path}` });

      const [start, end] = range;

      if (start < 1) {
        return {
          content: [{ type: "text" as const, text: "Error: start must be >= 1." }],
          isError: true,
        };
      }
      if (end < start) {
        return {
          content: [
            { type: "text" as const, text: "Error: end must be >= start." },
          ],
          isError: true,
        };
      }

      let original: string;
      try {
        original = await readFile(file_path, "utf-8");
      } catch {
        return {
          content: [
            { type: "text" as const, text: `Error: could not read file ${file_path}` },
          ],
          isError: true,
        };
      }

      const lines = original.split("\n");
      const hadTrailingNewline = original.endsWith("\n");
      if (hadTrailingNewline && lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop(); // Remove the phantom empty element caused by the trailing newline
      }

      // Allow start to be one past the last line (for appending)
      if (start > lines.length + 1) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: start (${start}) is beyond the end of the file (${lines.length} lines).`,
            },
          ],
          isError: true,
        };
      }

      if (end > lines.length + 1) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: end (${end}) is beyond the end of the file (${lines.length} lines).`,
            },
          ],
          isError: true,
        };
      }

      // Convert 1-based [start, end) to 0-based splice args
      const spliceStart = start - 1;
      const deleteCount = end - start;

      lines.splice(spliceStart, deleteCount, ...text);

      let updated = lines.join("\n");
      if (hadTrailingNewline) {
        updated += "\n";
      }
      await writeFile(file_path, updated, "utf-8");

      const diff = createPatch(file_path, original, updated, "", "", {
        context: 3,
      });
      console.log(diff);

      return {
        content: [{ type: "text" as const, text: `${diff}\n\nFile now has ${lines.length} lines.` }],
      };
    },
  );
}

