import React from "react";
import { Static, Text } from "ink";
import type { HistoryEntry } from "./types";

// ── Types ────────────────────────────────────────────────────────────────────

type Props = { items: HistoryEntry[] };

// Entries that carry a `text` field (all kinds except "phase").
type TextEntry = Extract<HistoryEntry, { text: string }>;

// ── Per-kind renderers ────────────────────────────────────────────────────────

function renderTextEntry(entry: TextEntry): React.JSX.Element {
  switch (entry.kind) {
    case "user_prompt":    return <Text key={entry.id} color="yellow">❯ {entry.text}</Text>;
    case "tool_use":       return <Text key={entry.id} dimColor>{entry.text}</Text>;
    case "tool_error":     return <Text key={entry.id} color="red">{entry.text}</Text>;
    case "stage_status":   return <Text key={entry.id}>{entry.text}</Text>;
    case "result":         return <Text key={entry.id} dimColor>{entry.text}</Text>;
    case "error":          return <Text key={entry.id} color="red" bold>{entry.text}</Text>;
    case "info":           return <Text key={entry.id} dimColor>{entry.text}</Text>;
    case "assistant_message": return <Text key={entry.id}>{entry.text}</Text>;
  }
}

function renderEntry(entry: HistoryEntry): React.JSX.Element {
  if (entry.kind === "phase") {
    return <Text key={entry.id} bold>── Phase: {entry.label} ──</Text>;
  }
  return renderTextEntry(entry);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MessageHistory({ items }: Props): React.JSX.Element {
  return (
    <Static items={items}>
      {(entry) => renderEntry(entry)}
    </Static>
  );
}
