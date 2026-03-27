# Magus

An AI-powered software development agent that decomposes tasks into structured, parallelizable execution plans (DAGs), runs concurrent coding agents against each stage, and documents learnings for future sessions. Built on Anthropic's Claude Agent SDK with Bun as its runtime.

## Building

Requires [Bun](https://bun.sh) v1.3+.

```bash
bun install
bun build src/magus.ts --compile
```

This produces a standalone `magus` binary in the project root.

To run tests:

```bash
bun test
```

## Usage

```bash
# Get help with usage
magus --help

# Read prompt from a file
magus -p prompt.txt

# Pipe prompt via stdin
echo "Add a retry mechanism to the HTTP client" | magus

# Resume a previous session
magus --resume <session-id>

# Run with all flags
magus -p prompt.txt --auto-approve --verbose --hide-tools
```

### Flags

| Flag | Description |
|------|-------------|
| `-p, --prompt <file>` | Read prompt from a file instead of stdin |
| `--resume <id>` | Resume a previous session by its ID |
| `--auto-approve` | Skip interactive plan approval |
| `-v, --verbose` | Show full plan details with dependencies |
| `-H, --hide-tools` | Suppress tool call output in the terminal |
| `-h, --help` | Display help |

### Environment

Set `ANTHROPIC_API_KEY` in your environment or in a `.env` file (Bun loads it automatically).

## How It Works

Magus runs a three-phase pipeline orchestrated by an event-driven async generator architecture.

### Phase 1: Planning

A **Planner** agent (Claude Opus) reads the codebase, identifies relevant skills from `.magus/skills/`, and decomposes the user's request into a directed acyclic graph (DAG) of stages. Each stage has an objective, file targets, acceptance criteria, and explicit dependencies on other stages.

The plan is rendered alongside an ASCII box-and-arrow diagram for review:

```
┌──────────┐   ┌──────────┐   ┌──────────┐
│ ○ task-a │   │ ○ task-b │   │ ○ task-d │
└──────────┘   └──────────┘   └──────────┘
      │              │              │
      └──────────────┤              │
                     ▼              │
               ┌──────────┐         │
               │ ○ task-c │         │
               └──────────┘         │
                     │              │
                     ├──────────────┘
                     ▼
               ┌──────────┐
               │ ○ task-e │
               └──────────┘
```

The user can approve the plan, provide feedback to refine it, or reject it entirely. Cyclic dependencies are automatically detected and fed back to the planner for correction.

### Phase 2: Execution

The **Executor** drives concurrent stage execution through the DAG. Stages with no unsatisfied dependencies are launched immediately as parallel **Coder** agents (Claude Sonnet). As stages complete, newly unblocked stages are launched until the entire plan is done.

Each coder agent follows a strict Test-Driven Development workflow:
1. **Red Phase** &mdash; Write tests and scaffolding stubs first
2. **Green Phase** &mdash; Implement the minimum code to make tests pass
3. **Refactor** &mdash; Improve code while keeping tests green

Coder agents receive context from their completed dependencies, so downstream stages can build on prior work without duplicating effort.

### Phase 3: Scribing

A **Scribe** agent (Claude Opus) reviews the execution results and writes a memory file to `.magus/memories/` documenting what was done, key decisions, and outcomes. It may also create or update reusable skill files in `.magus/skills/` when it identifies patterns worth preserving.

### Design Principles

- **Event-driven**: All phases yield typed discriminated-union events through async generators. No shared mutable state between phases.
- **Pure core, effectful shell**: Business logic is pure; side effects are isolated at boundaries (file I/O, API calls).
- **Parallel by default**: The DAG structure drives concurrent execution. Stages without dependencies on each other run simultaneously.
- **Structured output**: The planner uses JSON schema validation for guaranteed plan structure compliance.

## Skills & Memory

Magus maintains a knowledge base across sessions:

- **Memories** (`.magus/memories/`) capture what happened in each session &mdash; decisions made, problems encountered, outcomes achieved.
- **Skills** (`.magus/skills/`) capture reusable technical patterns &mdash; how to add CLI flags, data flow through the pipeline, rendering algorithms, testing patterns.

Both are written by the Scribe agent and read by the Planner in future sessions, giving Magus a form of persistent learning.
