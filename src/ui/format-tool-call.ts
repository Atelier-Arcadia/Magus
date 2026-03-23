const MAX_VALUE_LENGTH = 60;

function truncate(str: string, max = MAX_VALUE_LENGTH): string {
  return str.length > max ? str.slice(0, max) + "\u2026" : str;
}

function formatValue(value: unknown): string | null {
  if (value == null) return null;

  if (typeof value === "string") {
    return truncate(value.replaceAll("\n", " ").replaceAll("\r", ""));
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return truncate(value.join(","));
  }

  // Nested object – compact JSON
  return truncate(JSON.stringify(value).replaceAll("\n", " "));
}

export function formatToolCall(tool: string, input: unknown): string {
  const parts: string[] = [];

  if (input != null && typeof input === "object" && !Array.isArray(input)) {
    for (const [key, value] of Object.entries(input)) {
      const formatted = formatValue(value);
      if (formatted != null) {
        parts.push(`${key}=${formatted}`);
      }
    }
  }

  const args = parts.length > 0 ? " " + parts.join(" ") : "";
  return `[tool: ${tool}${args}]`;
}
