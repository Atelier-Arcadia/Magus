import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { readFile } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import type { MessageQueue } from "../message-queue";

const execAsync = promisify(exec);

function shellEscape(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

export function packageScriptTool(queue: MessageQueue) {
  return tool(
    "PackageScript",
    [
      "Run a script defined in the project's package.json scripts field.",
      "Optionally pass positional arguments that are appended after the script command.",
    ].join("\n"),
    {
      script_name: z
        .string()
        .describe(
          "The name of the script to run (a key in the package.json scripts object).",
        ),
      args: z
        .array(z.string())
        .optional()
        .describe(
          "Ordered list of command-line arguments to pass to the script. These are appended after the script command, e.g. bun run lint -- --fix src/foo.ts",
        ),
      cwd: z
        .string()
        .optional()
        .describe(
          "Absolute path to the working directory. Defaults to the project root (process.cwd()).",
        ),
    },
    async ({ script_name, args, cwd }) => {
      queue.push({ kind: "package-script", message: `running script "${script_name}"` });

      const resolvedCwd = cwd ?? process.cwd();

      let packageJson: Record<string, unknown>;
      try {
        const raw = await readFile(`${resolvedCwd}/package.json`, "utf-8");
        packageJson = JSON.parse(raw);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: could not read package.json: ${message}` }],
          isError: true,
        };
      }

      const scripts =
        typeof packageJson.scripts === "object" && packageJson.scripts !== null
          ? (packageJson.scripts as Record<string, unknown>)
          : null;

      if (!scripts || !(script_name in scripts)) {
        const available = scripts ? Object.keys(scripts).join(", ") : "(none)";
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: script "${script_name}" not found in package.json. Available scripts: ${available}`,
            },
          ],
          isError: true,
        };
      }

      let command = `bun run ${script_name}`;
      if (args && args.length > 0) {
        command += " -- " + args.map(shellEscape).join(" ");
      }

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: resolvedCwd,
        });

        const output = [stdout, stderr].filter(Boolean).join("\n");
        return {
          content: [{ type: "text" as const, text: output || "(no output)" }],
        };
      } catch (err: unknown) {
        const { stdout, stderr, message } = err as {
          stdout?: string;
          stderr?: string;
          message?: string;
        };
        return {
          content: [
            {
              type: "text" as const,
              text: `Error running script "${script_name}": ${message}\n\n${stderr}\n${stdout}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

