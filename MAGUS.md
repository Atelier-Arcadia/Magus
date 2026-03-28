# Magus

Magus is an AI-powered software development agent built on Anthropic's Claude Agent SDK. It decomposes user requests into structured, parallelisable execution plans (DAGs), runs concurrent coder agents against each stage, and documents learnings for future sessions.

## Runtime

- **Runtime**: Bun (not Node.js). Use `bun test`, `bun run`, `Bun.file()`, etc.
- **Language**: TypeScript (strict mode, ESNext).
- **Testing**: `bun test` (bun:test). TDD is mandatory — red phase first, green phase second.
- **Dependencies**: `@anthropic-ai/claude-agent-sdk`, `diff`, `zod`.

## Architecture

Magus follows a three-phase pipeline orchestrated by `src/engine/orchestrator.ts`:

```
User prompt
  → Planner (Claude Opus) — produces a DAG of stages as structured JSON
  → Plan Approval — user reviews the rendered DAG, approves or provides feedback
  → Executor — launches concurrent Coder agents (Claude Sonnet) per stage
  → Scribe (Claude Opus) — documents learnings to .magus/memories/ and .magus/skills/
```

All inter-component communication uses async generators yielding typed event streams. There is no shared mutable state between phases — data flows forward through events.

### Key Design Principles

- **Event-driven**: Every component (`agents/common.ts`, `engine/orchestrator.ts`, `engine/executor.ts`) is an `AsyncGenerator` yielding typed discriminated-union events.
- **Pure core, effectful shell**: Business logic should be pure functions; side effects (file I/O, LLM calls) should be isolated at the boundary.
- **Immutable data flow**: The `StagePlan` type flows from planner output → `ExecutionPlan` → executor prompts → rendered output without mutation.
- **Parallel execution**: The executor drives a DAG — stages with satisfied dependencies launch concurrently via a `Channel` abstraction.

## Directory Structure

```
src/
  code.ts               — CLI entrypoint (stdin/file prompt, ANSI output)
  code-helpers.ts       — Pure CLI flag parsers (--resume, --prompt, --auto-approve, -H, -v)
  assistant.ts          — Standalone interactive REPL (legacy/experimental)
  format-tool-call.ts   — Format tool name + input as a compact string

  engine/
    orchestrator.ts       — Top-level pipeline: plan → approve → execute → scribe
    executor.ts           — DAG executor: concurrent stage runner with Channel
    execution-plan.ts     — ExecutionPlan type, StagePlan type, DAG validation (Kahn's)
    channel.ts            — Channel abstraction for concurrent stage launching
    stage-prompt.ts       — Stage prompt formatter for coder agents
    save-plan.ts          — Persist approved plans to .magus/plans/
    scribe-runner.ts      — Factory for the scribe agent with its own MessageQueue
    prompt-for-approval.ts— Deferred promise bridging orchestrator ↔ UI for plan approval
    message-queue.ts      — Simple push-only event buffer for tool side-effect tracking

  agents/
    common.ts           — Core agent factory wrapping Claude Agent SDK’s `query()`
    planner.ts          — Planner agent: system prompt, JSON output schema, Opus model
    coder.ts            — Coder agent: TDD system prompt, Sonnet model, file tools
    scribe.ts           — Scribe agent: memory/skill writer, Opus model, date tool

  tools/
    edit.ts             — EditFile: line-range splice with diff output
    create-file.ts      — CreateFile: create empty file with mkdir -p
    makefile.ts         — Makefile: run Makefile targets via make
    date.ts             — Date: returns current date/time as structured JSON
    plan-stage.ts       — (empty — removed, was replaced by structured output)
  ui/
    mapEvent.ts         — Pure mapper: OrchestratorEvent → HistoryEntry[]
    types.ts            — HistoryEntry discriminated union type
    render-plan.ts      — Text-based box-and-arrow DAG renderer for ExecutionPlan

  __tests__/            — Co-located test files (bun:test)

.magus/
  memories/             — Session learnings (yyyy/mm/dd/slug.md)
  plans/                — Saved approved plans (yyyy/mm/dd/slug.md)
  skills/               — Reusable technical knowledge files
```

## Agent Roles

### Planner (`src/agents/planner.ts`)
- **Model**: Claude Opus
- **Tools**: Read, Glob, Grep (read-only codebase access)
- **Output**: Structured JSON via `outputFormat: { type: "json_schema" }` — produces `PlannerOutput` with `summary`, `stages[]` (each with `id`, `plan: StagePlan`, `dependencies`), and `open_questions`.
- **Behaviour**: Reads MAGUS.md and AGENTS.md first, identifies relevant skills, decomposes work into a DAG of ≤6-file stages.

### Coder (`src/agents/coder.ts`)
- **Model**: Claude Sonnet
- **Tools**: Read, Glob, Grep + MCP tools (EditFile, CreateFile, Makefile)
- **Output**: Free-text summary of work completed.
- **Behaviour**: Strict TDD (red→green→refactor). Pure functional style: small functions (≤12 lines), immutable data, controlled side effects, higher-order functions.
- **Context passing**: Receives summaries from completed dependency stages prepended to its prompt.

### Scribe (`src/agents/scribe.ts`)
- **Model**: Claude Opus
- **Tools**: Read, Glob, Grep + MCP tools (CreateFile, EditFile, Date)
- **Output**: Memory file + optional skill files.
- **Behaviour**: Writes exactly one memory to `.magus/memories/<yyyy>/<mm>/<dd>/<slug>.md`. May create/update skills in `.magus/skills/`.

## Data Flow: StagePlan

The `StagePlan` type (defined in `src/engine/execution-plan.ts`) is the central data structure:

```typescript
type StagePlan = {
  objective: string;   // What this stage achieves
  context: string[];   // Files to read for context
  skills: string[];    // Applicable skill file paths
  targets: string[];   // Files to modify
  inScope: string[];   // What's in scope
  outScope: string[];  // What's explicitly out of scope
  acs: string[];       // Acceptance criteria
};
```

Flow: `Planner LLM → PlannerOutput.stages[].plan → orchestrator maps to StageDefinition[] → createExecutionPlan() → Stage.plan`, consumed by:
- `engine/executor.ts`: `formatStagePlan(id, plan)` → coder prompt markdown
- `engine/orchestrator.ts`: `renderStageSection()` → scribe prompt (objective only)
- `ui/render-plan.ts`: `renderPlanDetails()` → user-facing verbose/summary view

**Note**: There are two distinct `formatStagePlan` functions — one in `engine/executor.ts` (public, produces full coder-facing markdown with headers) and one in `ui/render-plan.ts` (private, for verbose plan display). They serve different formatting needs.

## Entrypoints

### `src/code.ts` — Primary CLI
```bash
echo "your prompt" | bun src/code.ts [--resume <id>] [-p <file>] [--auto-approve] [-H] [-v]
```
- Reads prompt from stdin or `--prompt`/`-p` file
- Single run, then exit
- `--auto-approve`: skip interactive plan approval
- `-H`/`--hide-tools`: suppress tool call output
- `-v`/`--verbose`: show full plan details with dependencies

### `src/assistant.ts` — Legacy REPL
Interactive readline-based assistant. Not part of the main pipeline.

## Conventions

### Adding CLI Flags
See skill: `.magus/skills/cli-flag-parser-pattern.md`
- Boolean: `args.includes("--flag")` pattern in `code-helpers.ts`
- Value: `args.indexOf` with sentinel handling
- Thread through `drainEvents` → consumers with `= false` defaults

### Adding StagePlan Fields
See skill: `.magus/skills/magus-stage-plan-data-flow.md`
1. Add to `StagePlan` type in `engine/execution-plan.ts`
2. Add to `OUTPUT_SCHEMA` in `planner.ts`
3. Update `SYSTEM_PROMPT` in `planner.ts`
4. Handle in `engine/executor.ts` `formatStagePlan` (for coder prompts)
5. Handle in `ui/render-plan.ts` private `formatStagePlan` (for verbose plan display)
6. Update test helpers

### Testing
- Tests live in `src/__tests__/` with `.test.ts` extensions
- Use `makePlan(objective)` helpers for `StagePlan` fixtures
- Mock at the module level with `mock.module()`
- Dependency injection for side effects (e.g., `OrchestratorDeps`)
