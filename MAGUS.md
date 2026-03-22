# Magus

Magus is an AI-powered software development agent built on Anthropic's Claude Agent SDK. It decomposes user requests into structured, parallelisable execution plans (DAGs), runs concurrent coder agents against each stage, and documents learnings for future sessions.

## Runtime

- **Runtime**: Bun (not Node.js). Use `bun test`, `bun run`, `Bun.file()`, etc.
- **Language**: TypeScript (strict mode, ESNext, `react-jsx`).
- **Testing**: `bun test` (bun:test). TDD is mandatory — red phase first, green phase second.
- **Dependencies**: `@anthropic-ai/claude-agent-sdk`, `diff`, `yaml`, `ink` (React TUI), `zod`.

## Architecture

Magus follows a three-phase pipeline orchestrated by `src/orchestrator.ts`:

```
User prompt
  → Planner (Claude Opus) — produces a DAG of stages as structured JSON
  → Plan Approval — user reviews the rendered DAG, approves or provides feedback
  → Executor — launches concurrent Coder agents (Claude Sonnet) per stage
  → Scribe (Claude Opus) — documents learnings to .magus/memories/ and .magus/skills/
```

All inter-component communication uses async generators yielding typed event streams. There is no shared mutable state between phases — data flows forward through events.

### Key Design Principles

- **Event-driven**: Every component (`agent.ts`, `orchestrator.ts`, `executor.ts`) is an `AsyncGenerator` yielding typed discriminated-union events.
- **Pure core, effectful shell**: Business logic should be pure functions; side effects (file I/O, LLM calls) should be isolated at the boundary.
- **Immutable data flow**: The `StagePlan` type flows from planner output → `ExecutionPlan` → executor prompts → rendered output without mutation.
- **Parallel execution**: The executor drives a DAG — stages with satisfied dependencies launch concurrently via a `Channel` abstraction.

## Directory Structure

```
src/
  agent.ts              — Core agent factory wrapping Claude Agent SDK's `query()`
  orchestrator.ts       — Top-level pipeline: plan → approve → execute → scribe
  executor.ts           — DAG executor: concurrent stage runner with Channel
  execution-plan.ts     — ExecutionPlan type, StagePlan type, DAG validation (Kahn's)
  render-plan.ts        — Text-based box-and-arrow DAG renderer (Grid class)
  save-plan.ts          — Persist approved plans to .magus/plans/
  scribe-runner.ts      — Factory for the scribe agent with its own MessageQueue
  code.ts               — CLI entrypoint (stdin/file prompt, ANSI output)
  code-helpers.ts       — Pure CLI flag parsers (--resume, --prompt, --auto-approve, -H, -v)
  assistant.ts          — Standalone interactive REPL (legacy/experimental)
  config.ts             — YAML config loader (magus.yml) with env var expansion
  message-queue.ts      — Simple push-only event buffer for tool side-effect tracking
  format-tool-call.ts   — Format tool name + input as a compact string
  prompt-for-approval.ts— Deferred promise bridging orchestrator ↔ UI for plan approval

  agents/
    planner.ts          — Planner agent: system prompt, JSON output schema, Opus model
    coder.ts            — Coder agent: TDD system prompt, Sonnet model, file tools
    scribe.ts           — Scribe agent: memory/skill writer, Opus model, date tool

  tools/
    edit.ts             — EditFile: line-range splice with diff output
    create-file.ts      — CreateFile: create empty file with mkdir -p
    delete-file.ts      — (empty — unused)
    package-script.ts   — PackageScript: run package.json scripts via bun
    date.ts             — Date: returns current date/time as structured JSON
    plan-stage.ts       — (empty — removed, was replaced by structured output)

  ui/
    App.tsx             — Ink React component: orchestrator integration
    MessageHistory.tsx  — Ink Static-based streaming message list
    TextInput.tsx       — Ink text input component
    mapEvent.ts         — Pure mapper: OrchestratorEvent → HistoryEntry[]
    types.ts            — HistoryEntry discriminated union type

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
- **Tools**: Read, Glob, Grep + MCP tools (EditFile, CreateFile, PackageScript)
- **Output**: Free-text summary of work completed.
- **Behaviour**: Strict TDD (red→green→refactor). Pure functional style: small functions (≤12 lines), immutable data, controlled side effects, higher-order functions.
- **Context passing**: Receives summaries from completed dependency stages prepended to its prompt.

### Scribe (`src/agents/scribe.ts`)
- **Model**: Claude Opus
- **Tools**: Read, Glob, Grep + MCP tools (CreateFile, EditFile, Date)
- **Output**: Memory file + optional skill files.
- **Behaviour**: Writes exactly one memory to `.magus/memories/<yyyy>/<mm>/<dd>/<slug>.md`. May create/update skills in `.magus/skills/`.

## Data Flow: StagePlan

The `StagePlan` type (defined in `src/execution-plan.ts`) is the central data structure:

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
- `executor.ts`: `formatStagePlan(id, plan)` → coder prompt markdown
- `orchestrator.ts`: `renderStageSection()` → scribe prompt (objective only)
- `render-plan.ts`: `renderPlanDetails()` → user-facing verbose/summary view

**Note**: There are two distinct `formatStagePlan` functions — one in `executor.ts` (public, produces full coder-facing markdown with headers) and one in `render-plan.ts` (private, for verbose plan display). They serve different formatting needs.

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
1. Add to `StagePlan` type in `execution-plan.ts`
2. Add to `OUTPUT_SCHEMA` in `planner.ts`
3. Update `SYSTEM_PROMPT` in `planner.ts`
4. Handle in `executor.ts` `formatStagePlan`
5. Handle in `render-plan.ts` private `formatStagePlan`
6. Update test helpers

### Testing
- Tests live in `src/__tests__/` with `.test.ts`/`.test.tsx` extensions
- Use `makePlan(objective)` helpers for `StagePlan` fixtures
- Mock at the module level with `mock.module()`
- Dependency injection for side effects (e.g., `OrchestratorDeps`)

## Refactoring Opportunities

The following areas would benefit from refactoring to better align with the coder agent's functional programming principles (pure core, isolated side effects, small functions):

### 1. `orchestrator.ts` — Monolithic `run()` Generator
The `run()` method is a ~120-line async generator mixing concerns: planning loop, approval handling, plan saving, execution, scribing, and session management. This should be decomposed into smaller, composable functions:
- Extract `planningLoop()` — handles the plan/approve/refine cycle
- Extract `executionPhase()` — wraps `executePlan` with phase events
- Extract `scribePhase()` — builds prompt and runs scribe
- The `run()` method becomes a thin pipeline composing these phases

### 2. `executor.ts` — Mixed Pure and Effectful Code
The file contains pure formatting functions (`formatStagePlan`, `buildStagePrompt`, `bulletItems`, etc.) alongside the effectful executor (`runStage`, `executePlan`) and the `Channel` abstraction. These should be separated:
- Move `formatStagePlan`, `buildStagePrompt`, and helpers to a dedicated `stage-prompt.ts` module
- Move `Channel` to its own `channel.ts` module
- Keep `executor.ts` as a thin orchestration layer

### 3. `render-plan.ts` — Grid Class is Mutable
The `Grid` class uses mutable `cells[][]` with `set()` and `write()` methods. While contained, this could be refactored to use a builder pattern or functional approach where the grid is constructed via composition rather than mutation.

### 4. `ExecutionPlan` — Methods on Data
The `ExecutionPlan` type bundles data (`stages` map) with methods (`ready()`, `markRunning()`, etc.) that mutate the stages in place. This violates immutability:
- Separate the data (a plain `Map<string, Stage>`) from operations
- Make state transitions return new `Stage` objects instead of mutating
- Or, at minimum, make the mutation methods standalone functions accepting and returning plan state

### 5. Tool Definitions — Side Effects Inside Closures
Tools like `editFileTool` and `createFileTool` close over a `MessageQueue` and perform file I/O directly in the tool handler. The handler logic (validation, line splicing, diff generation) should be extractable as pure functions, with the actual I/O at the boundary:
- Extract `applyEdit(original: string, range, text): string | Error` as a pure function
- Keep only `readFile`/`writeFile` in the tool handler

### 6. `code.ts` — Top-Level Side Effects
The CLI entrypoint mixes flag parsing, prompt reading, orchestrator construction, and event rendering at the module's top level. This makes it untestable:
- Extract a `main(args: string[])` function
- Inject I/O dependencies (stdout, stdin, process.exit)

### 7. `agent.ts` — `mapSdkMessage` Handles Unknown Block Types
The `mapSdkMessage` function has a `tool_result` case inside the `assistant` message type handler that uses `any` casts and handles an unexpected block type. This should be typed more precisely or documented as an SDK workaround.

### 8. Dead Files
The following files are empty or unused and should be removed:
- `src/tools/plan-stage.ts` (emptied after structured output refactor)
- `src/tools/delete-file.ts` (empty, never implemented)
- `src/agents/.planner.ts.swp` (vim swap file)

### 9. `config.ts` — Only Used by `assistant.ts`
The YAML config system (`magus.yml`, `loadConfig()`) is only consumed by the legacy `assistant.ts` REPL. If assistant.ts is deprecated, config.ts may be dead code. If kept, the config should be integrated into the main pipeline.

### 10. Duplicate Pattern: Message Formatting
`code.ts` has its own ANSI formatting (`formatEntry`) while `ui/MessageHistory.tsx` has Ink-based rendering (`renderEntry`). These serve different outputs (raw terminal vs Ink) but share the same mapping logic — the kind→style mapping could be unified into a shared style definition.
