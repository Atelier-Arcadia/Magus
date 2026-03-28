import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { access } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import type { MessageQueue } from "../message-queue";

const execAsync = promisify(exec);

/**
 * Shell-escapes a single argument.
 * Safe arguments (only alphanumeric, dash, dot, slash, equals, colon, @) are
 * returned verbatim; all others are wrapped in single quotes with internal
 * single-quotes handled via the '\'' idiom.
 */
function shellEscape(arg: string): string {
  if (/^[a-zA-Z0-9_\-./=:@]+$/.test(arg)) return arg;
  return "'" + arg.replace(/'/g, "'\\''" ) + "'";
}

/** Builds the make command string from a target and optional arguments. */
function buildCommand(target: string, args: string[] | undefined): string {
  const base = `make ${target}`;
  if (!args || args.length === 0) return base;
  return base + " " + args.map(shellEscape).join(" ");
}

/** Returns an isError tool response with the given text. */
function errorResponse(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true as const,
  };
}

export function makefileTool(queue: MessageQueue) {
  return tool(
    "Makefile",
    [
      "Run a target defined in the project's Makefile.",
      "Optionally pass additional arguments appended after the target name.",
    ].join("\n"),
    {
      target: z.string().describe("The Makefile target to run."),
      args: z
        .array(z.string())
        .optional()
        .describe("Arguments appended after the target name."),
      cwd: z
        .string()
        .optional()
        .describe(
          "Absolute path to the working directory. Defaults to the project root (process.cwd()).",
        ),
    },
    async ({ target, args, cwd }) => {
      queue.push({ kind: "makefile", message: `running target "${target}"` });

      const resolvedCwd = cwd ?? process.cwd();

      try {
        await access(join(resolvedCwd, "Makefile"));
      } catch {
        return errorResponse(`Error: no Makefile found in ${resolvedCwd}`);
      }

      const command = buildCommand(target, args);

      try {
        const { stdout, stderr } = await execAsync(command, { cwd: resolvedCwd });
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
        return errorResponse(
          `Error running target "${target}": ${message}\n\n${stderr}\n${stdout}`,
        );
      }
    },
  );
}

