---
name: magus
description: Summon the Magus coding agent to implement plans for software development tasks
invocable: true
model: opus
---

# Magus

The `magus` CLI program provides an agentic coding workflow that:
1. Produces an implementation plan specifically for Magus' coder agents to implement with maximum concurrency.
2. Executes coder agents that implement software with a functional programming style using test-driven development.
3. Writes memory files and magus-specific skill files to remember important outcomes, decisions and key technical insights.

All of magus' files are saved to `./magus/plans/`, `./magus/memories/` and `./magus/skills`.

## Running Magus

Magus supports the following command-line arguments:

| Flag | Description |
|------|-------------|
| `-p, --prompt <file>` | Read prompt from a file instead of stdin |
| `--resume <id>` | Resume a previous session by its ID |
| `--auto-approve` | Skip interactive plan approval |
| `-v, --verbose` | Show full plan details with dependencies |
| `-H, --hide-tools` | Suppress tool |

IMPORTANT: After producing a plan, Magus' default behaviour is to use the TTY to ask the user if they approve the plan or have feedback.
Because we can not interact with the TTY easily from Claude Code, Magus must always be run from Claude Code with the `--auto-approve` flag to
trigger automatic execution of the coding phase.

Remember: You can learn magus' full set of supported command-line arguments by running `magus -h` or `magus --help`.

## Supporting the User

The following rules are MANDATORY when working with Magus and ensure the smoothest experience for the user possible.

Rules:
* Before ever running Magus, you MUST ensure that the user's project has a `Makefile` available. Magus can only execute `make` commands.
* You MUST ensure that the user has done sufficient planning before invoking Magus.
* You NEVER invoke Magus by piping a prompt to it over stdin.  There must always be a file containing the prompt you pass to Magus.

The following guidelines are best practices that you SHOULD follow to facilitate the best user experience.

Guidelines:
* If you can infer that the user would want to see more explicit details about the prompts passed to coder agents, including the `-v` or `--verbose` flag.
* If you can infer that the user would NOT want to see tool outputs (e.g. [Read path/to/file]), include the `-H` or `--hide-tools` flag.

Note that the `-H` and `--hide-tools` flag DO NOT hide edit tool calls, which display diffs of the changes made to files.
If you are ever uncertain and the user would want you to confirm their choices, use the `AskUserQuestion` tool to do so. Only ever ask about these optional flags.

## Workflow

1. Verify that a `Makefile` exists. If it does not, explain its necessity to the user and offer to create one with simple "test" and "lint" commands.
2. Verify that the user has completed an implementation plan and that it has been saved to a file.
3. In a Task: invoke `magus -p <path/to/plan.md> --auto-approve [optional flags]`.
4. Inform the user that `magus` is running in a task and monitor the task for completion.
5. Once the task completes, summarize all of the changes to the user.
