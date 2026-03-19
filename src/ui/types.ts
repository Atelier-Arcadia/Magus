export type HistoryEntry =
  | { kind: "user_prompt"; id: string; text: string }
  | { kind: "assistant_message"; id: string; text: string }
  | { kind: "tool_use"; id: string; text: string }
  | { kind: "tool_error"; id: string; text: string }
  | { kind: "phase"; id: string; label: string }
  | { kind: "stage_status"; id: string; text: string }
  | { kind: "info"; id: string; text: string }
  | { kind: "result"; id: string; text: string }
  | { kind: "error"; id: string; text: string };
