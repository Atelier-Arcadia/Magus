import { readFileSync } from "fs";
import { resolve } from "path";
import { parse } from "yaml";

export type MagusConfig = {
  memory: {
    obsidian_vault: string;
  };
};

const ENV_VAR_PATTERN = /\$\{(\w+)\}|\$(\w+)/g;

export function expandEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (_, braced: string, bare: string) =>
    process.env[braced ?? bare] ?? "",
  );
}

function expandEnvVarsRecursive(obj: unknown): unknown {
  if (typeof obj === "string") return expandEnvVars(obj);
  if (Array.isArray(obj)) return obj.map(expandEnvVarsRecursive);
  if (obj !== null && typeof obj === "object")
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        k,
        expandEnvVarsRecursive(v),
      ]),
    );
  return obj;
}

export function loadConfig(cwd: string = process.cwd()): MagusConfig {
  const configPath = resolve(cwd, "magus.yml");
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    throw new Error(`Configuration file magus.yml not found in ${cwd}`);
  }
  return expandEnvVarsRecursive(parse(raw)) as MagusConfig;
}
