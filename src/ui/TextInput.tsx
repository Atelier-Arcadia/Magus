import React, { type FC } from "react";
import { Text, useInput } from "ink";
import type { Key } from "ink";

const CURSOR = "▎";

export type TextInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  isActive?: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip non-printable control characters from raw terminal input.
 * Keeps printable ASCII (0x20–0x7E), newlines, tabs, and all non-ASCII
 * (emoji, CJK, etc). Drops DEL (0x7F) and C0 controls (0x00–0x1F)
 * except \t and \n.
 */
export function stripControl(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)!;
    if (code === 0x7f) continue;                   // DEL
    if (code < 0x20 && code !== 0x09 && code !== 0x0a) continue; // C0 except \t, \n
    out += raw[i];
  }
  return out;
}

// ── Pure input handler factory ───────────────────────────────────────────────

export function buildInputHandler(
  value: string,
  onChange: (value: string) => void,
  onSubmit: (value: string) => void,
) {
  return (input: string, key: Key): void => {
    // Alt+Enter → insert newline
    if (key.return && key.meta) {
      onChange(value + "\n");
      return;
    }
    if (key.return) {
      onSubmit(value);
      onChange("");
      return;
    }
    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }
    const clean = stripControl(input);
    if (clean) {
      onChange(value + clean);
    }
  };
}

// ── Pure display resolver ─────────────────────────────────────────────────────

type Display = { text: string; dim: boolean };

function resolveDisplay(
  value: string,
  isActive: boolean,
  placeholder?: string,
): Display {
  if (isActive) return { text: value + CURSOR, dim: false };
  if (!value && placeholder) return { text: placeholder, dim: true };
  return { text: value, dim: false };
}

// ── Component ────────────────────────────────────────────────────────────────

const TextInput: FC<TextInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  isActive = true,
}) => {
  useInput(buildInputHandler(value, onChange, onSubmit), { isActive });
  const { text, dim } = resolveDisplay(value, isActive, placeholder);
  return <Text dimColor={dim}>{text}</Text>;
};

export default TextInput;
