import type { ExecutionPlan, Stage, StagePlan } from "./execution-plan";

// ── Primitive formatters ────────────────────────────────────────────────────────

function bulletItems(items: string[]): string {
  return items.map((item) => `* ${item}`).join("\n");
}

function scopeItems(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function acItems(items: string[]): string {
  return items.map((item) => `* [ ] ${item}`).join("\n");
}

// ── Section body builders ─────────────────────────────────────────────────────

function formatContextBody(plan: StagePlan): string {
  const parts: string[] = [];
  if (plan.context.length > 0) parts.push(`Files to inspect:\n${bulletItems(plan.context)}`);
  if (plan.skills.length > 0) parts.push(`Skills:\n${bulletItems(plan.skills)}`);
  if (plan.targets.length > 0) parts.push(`Files to modify:\n${bulletItems(plan.targets)}`);
  return parts.join("\n\n");
}

function formatScopeBody(plan: StagePlan): string {
  const parts: string[] = [];
  if (plan.inScope.length > 0) parts.push(`In scope:\n${scopeItems(plan.inScope)}`);
  if (plan.outScope.length > 0) parts.push(`Out of scope:\n${scopeItems(plan.outScope)}`);
  return parts.join("\n\n");
}

// ── Public API ───────────────────────────────────────────────────────────────────

/**
 * Convert a structured StagePlan object back into the markdown format
 * that coder agents expect as their prompt.
 */
export function formatStagePlan(id: string, plan: StagePlan): string {
  const sections: string[] = [`# Stage: ${id}`, "", plan.objective];

  const contextBody = formatContextBody(plan);
  if (contextBody) sections.push("", "## Context", "", contextBody);

  const scopeBody = formatScopeBody(plan);
  if (scopeBody) sections.push("", "## Scope", "", scopeBody);

  if (plan.acs.length > 0) {
    const acBody = `This work is only considered done when:\n${acItems(plan.acs)}`;
    sections.push("", "## Acceptance Criteria", "", acBody);
  }

  return sections.join("\n");
}

/**
 * Build the prompt for a stage, prepending context from completed
 * parent stages when the stage has dependencies.
 */
export function buildStagePrompt(stage: Stage, plan: ExecutionPlan): string {
  const stageMarkdown = formatStagePlan(stage.id, stage.plan);

  if (stage.dependencies.length === 0) {
    return stageMarkdown;
  }

  const parentSections = stage.dependencies
    .map((depId) => plan.stages.get(depId)!)
    .map((dep) => `### ${dep.id}\n${dep.result}`);

  return [
    "## Context from Completed Dependencies",
    "",
    ...parentSections,
    "",
    "---",
    "",
    stageMarkdown,
  ].join("\n");
}
