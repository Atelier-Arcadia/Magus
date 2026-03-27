---
name: planner-authored-file-workflow
description: Workflow for tasks where the planner agent should produce the full file contents and the coder merely writes them. Use when the task is primarily analytical or documentation-oriented rather than iterative coding.
---

# Planner-Authored File Workflow

Current version: 0.0.1

Describes when and how to use a single-stage plan where the planner produces complete file contents inline, delegating only the file-write to the coder.

## Inputs

- A task that is primarily analytical, documentary, or involves synthesising information from across the codebase into a single output file.
- The output is a known format (Markdown, config, etc.) that doesn't require iterative test-driven development.

## Outputs

- A single-stage plan with the full file contents specified in the stage's `plan` field.
- The coder creates or overwrites the file without needing to make architectural decisions.

## Failure Modes

- **File too large for plan**: If the target file would exceed ~500 lines, the planner's structured output may hit token limits. In that case, split into multiple stages or have the coder generate sections.
- **Coder deviates from spec**: The coder agent may reinterpret instructions. Providing the content verbatim (e.g., in a fenced code block within the plan) minimises deviation.
- **Stale analysis**: Since the planner reads files at planning time but the coder runs later, files could change between phases. This is only a concern in multi-stage plans where earlier stages modify files the planner analysed.

## Scope

Applies to documentation files (MAGUS.md, AGENTS.md, README, ADRs), configuration files, and other outputs where the value is in the analysis, not in iterative code-test cycles. Does NOT apply to source code that should go through TDD.

## Body

### When to Use

Use this workflow when:
1. The task requires reading and synthesising many files but produces a single output.
2. The output doesn't need tests (documentation, config, metadata).
3. The planner's Opus model is better suited to the analytical work than the coder's Sonnet model.
4. The user explicitly requests a documentation or analysis task.

### Plan Structure

The planner should:
1. Read all relevant files during its analysis phase.
2. Produce a single stage with a descriptive `objective`.
3. Include the complete file contents in the stage's `plan` text, typically in a fenced code block.
4. Set `targets` to the output file path.
5. Set `context` to the key files that informed the analysis.
6. Keep acceptance criteria simple (e.g., "File exists at path with all sections populated").

### Why Single-Stage

Multi-stage plans are for parallelisable work. A single synthesised document has no internal parallelism — every section depends on the same holistic understanding. Splitting it into stages (e.g., one per section) would lose cross-referencing coherence and add unnecessary overhead.

## Changes

* 0.0.1 - Initial version based on the MAGUS.md creation workflow
