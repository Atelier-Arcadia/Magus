import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";

// ── Pure helpers ──────────────────────────────────────────────────────────────────────────────────

function truncateAtWordBoundary(slug: string, maxLen: number): string {
  if (slug.length <= maxLen) return slug;
  const truncated = slug.slice(0, maxLen);
  const lastHyphen = truncated.lastIndexOf("-");
  return lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated;
}

export function slugifyPrompt(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return truncateAtWordBoundary(slug, 50) || "plan";
}

function padDatePart(n: number, digits: number): string {
  return String(n).padStart(digits, "0");
}

export function buildPlanPath(cwd: string, date: Date, planName: string): string {
  const yyyy = padDatePart(date.getFullYear(), 4);
  const mm = padDatePart(date.getMonth() + 1, 2);
  const dd = padDatePart(date.getDate(), 2);
  return join(cwd, ".magus", "plans", yyyy, mm, dd, `${planName}.md`);
}

// ── Collision resolution ─────────────────────────────────────────────────────────────────────────

function withCounter(basePath: string, counter: number): string {
  return basePath.replace(/\.md$/, `-${counter}.md`);
}

function findFreePath(basePath: string): string {
  if (!existsSync(basePath)) return basePath;
  let counter = 2;
  while (existsSync(withCounter(basePath, counter))) counter++;
  return withCounter(basePath, counter);
}

// ── Main export ──────────────────────────────────────────────────────────────────────────────────

export async function savePlan(options: {
  renderedPlan: string;
  prompt: string;
  cwd?: string;
}): Promise<string | undefined> {
  try {
    const { renderedPlan, prompt, cwd = process.cwd() } = options;
    const planName = slugifyPrompt(prompt);
    const basePath = buildPlanPath(cwd, new Date(), planName);
    const filePath = findFreePath(basePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, renderedPlan, "utf-8");
    return filePath;
  } catch {
    return undefined;
  }
}

