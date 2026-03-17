import { tool } from "@anthropic-ai/claude-agent-sdk";

export type DateStructure = {
  year: number;
  month: string;
  day: string;
  hours: number;
  minutes: string;
  seconds: string;
};

const pad = (n: number): string => String(n).padStart(2, "0");

export const formatDate = (date: Date): DateStructure => ({
  year: date.getFullYear(),
  month: pad(date.getMonth() + 1),
  day: pad(date.getDate()),
  hours: date.getHours() || 24,
  minutes: pad(date.getMinutes()),
  seconds: pad(date.getSeconds()),
});

export function dateTool() {
  return tool(
    "Date",
    "Returns the current date and time.",
    {},
    async () => ({
      content: [{ type: "text" as const, text: JSON.stringify(formatDate(new Date())) }],
    }),
  );
}
