import { describe, expect, mock, test } from "bun:test";
import React from "react";
import { renderToString } from "ink";
import type { Key } from "ink";
import TextInput, { buildInputHandler, stripControl } from "../ui/TextInput";

const CURSOR = "▎";

// ── Key factory ──────────────────────────────────────────────────────────────

const makeKey = (overrides: Partial<Key> = {}): Key => ({
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
  hyper: false,
  capsLock: false,
  numLock: false,
  ...overrides,
});

// ── buildInputHandler – Enter key ─────────────────────────────────────────────

describe("buildInputHandler – Enter key", () => {
  test("calls onSubmit with the current value", () => {
    const onSubmit = mock(() => {});
    const handler = buildInputHandler("hello", mock(() => {}), onSubmit);
    handler("", makeKey({ return: true }));
    expect(onSubmit).toHaveBeenCalledWith("hello");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("calls onChange with empty string to clear the input", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("hello", onChange, mock(() => {}));
    handler("", makeKey({ return: true }));
    expect(onChange).toHaveBeenCalledWith("");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test("calls onSubmit before onChange", () => {
    const calls: string[] = [];
    const onSubmit = mock(() => { calls.push("submit"); });
    const onChange = mock(() => { calls.push("change"); });
    const handler = buildInputHandler("hello", onChange, onSubmit);
    handler("", makeKey({ return: true }));
    expect(calls).toEqual(["submit", "change"]);
  });

  test("calls onSubmit with empty string when value is already empty", () => {
    const onSubmit = mock(() => {});
    const handler = buildInputHandler("", mock(() => {}), onSubmit);
    handler("", makeKey({ return: true }));
    expect(onSubmit).toHaveBeenCalledWith("");
  });
});

// ── buildInputHandler – Backspace key ─────────────────────────────────────────

describe("buildInputHandler – Backspace key", () => {
  test("removes the last character from a multi-character value", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("hello", onChange, mock(() => {}));
    handler("", makeKey({ backspace: true }));
    expect(onChange).toHaveBeenCalledWith("hell");
  });

  test("produces empty string when value is a single character", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("h", onChange, mock(() => {}));
    handler("", makeKey({ backspace: true }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  test("produces empty string when value is already empty", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("", onChange, mock(() => {}));
    handler("", makeKey({ backspace: true }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  test("does not call onSubmit", () => {
    const onSubmit = mock(() => {});
    const handler = buildInputHandler("hello", mock(() => {}), onSubmit);
    handler("", makeKey({ backspace: true }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ── buildInputHandler – printable character input ─────────────────────────────

describe("buildInputHandler – printable character", () => {
  test("appends a single character to the value", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("hel", onChange, mock(() => {}));
    handler("l", makeKey());
    expect(onChange).toHaveBeenCalledWith("hell");
  });

  test("appends a character to an empty value", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("", onChange, mock(() => {}));
    handler("a", makeKey());
    expect(onChange).toHaveBeenCalledWith("a");
  });

  test("appends a pasted multi-character string", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("hello ", onChange, mock(() => {}));
    handler("world", makeKey());
    expect(onChange).toHaveBeenCalledWith("hello world");
  });

  test("does not call onSubmit for printable characters", () => {
    const onSubmit = mock(() => {});
    const handler = buildInputHandler("hi", mock(() => {}), onSubmit);
    handler("!", makeKey());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ── buildInputHandler – non-actionable keys ───────────────────────────────────

describe("buildInputHandler – non-actionable keys", () => {
  test("does not call onChange on Escape", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("hello", onChange, mock(() => {}));
    handler("", makeKey({ escape: true }));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("does not call onSubmit on Escape", () => {
    const onSubmit = mock(() => {});
    const handler = buildInputHandler("hello", mock(() => {}), onSubmit);
    handler("", makeKey({ escape: true }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("does not call onChange on an arrow key", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("hello", onChange, mock(() => {}));
    handler("", makeKey({ upArrow: true }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ── Rendering – active ────────────────────────────────────────────────────────

describe("TextInput rendering – active", () => {
  test("appends cursor to value when active", () => {
    const output = renderToString(
      <TextInput value="hello" onChange={() => {}} onSubmit={() => {}} isActive />,
    );
    expect(output).toContain(`hello${CURSOR}`);
  });

  test("shows only cursor when active and value is empty", () => {
    const output = renderToString(
      <TextInput value="" onChange={() => {}} onSubmit={() => {}} isActive />,
    );
    expect(output).toContain(CURSOR);
  });

  test("does not show placeholder when active even if value is empty", () => {
    const output = renderToString(
      <TextInput
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        isActive
        placeholder="Type here"
      />,
    );
    expect(output).not.toContain("Type here");
    expect(output).toContain(CURSOR);
  });

  test("isActive defaults to true and shows cursor", () => {
    const output = renderToString(
      <TextInput value="hi" onChange={() => {}} onSubmit={() => {}} />,
    );
    expect(output).toContain(`hi${CURSOR}`);
  });
});

// ── Rendering – inactive ──────────────────────────────────────────────────────

describe("TextInput rendering – inactive", () => {
  test("shows value without cursor when inactive", () => {
    const output = renderToString(
      <TextInput value="hello" onChange={() => {}} onSubmit={() => {}} isActive={false} />,
    );
    expect(output).toContain("hello");
    expect(output).not.toContain(CURSOR);
  });

  test("shows placeholder text when inactive and value is empty", () => {
    const output = renderToString(
      <TextInput
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        isActive={false}
        placeholder="Type here"
      />,
    );
    expect(output).toContain("Type here");
    expect(output).not.toContain(CURSOR);
  });

  test("shows nothing when inactive, value is empty, and no placeholder", () => {
    const output = renderToString(
      <TextInput value="" onChange={() => {}} onSubmit={() => {}} isActive={false} />,
    );
    expect(output).toBe("");
  });

  test("shows value not placeholder when inactive with non-empty value", () => {
    const output = renderToString(
      <TextInput
        value="hello"
        onChange={() => {}}
        onSubmit={() => {}}
        isActive={false}
        placeholder="Type here"
      />,
    );
    expect(output).toContain("hello");
    expect(output).not.toContain("Type here");
    expect(output).not.toContain(CURSOR);
  });
});

// ── stripControl ─────────────────────────────────────────────────────────────

describe("stripControl", () => {
  test("passes through normal ASCII text unchanged", () => {
    expect(stripControl("hello")).toBe("hello");
  });

  test("strips DEL character (0x7F)", () => {
    expect(stripControl("abc\x7F")).toBe("abc");
  });

  test("strips C0 control characters (0x00–0x1F) except tab and newline", () => {
    expect(stripControl("a\x01b\x02c")).toBe("abc");
  });

  test("preserves tab characters", () => {
    expect(stripControl("a\tb")).toBe("a\tb");
  });

  test("preserves newline characters", () => {
    expect(stripControl("a\nb")).toBe("a\nb");
  });

  test("preserves non-ASCII characters (emoji, CJK)", () => {
    expect(stripControl("hello 🌸")).toBe("hello 🌸");
  });

  test("returns empty string when input is only control characters", () => {
    expect(stripControl("\x01\x02\x7F")).toBe("");
  });

  test("returns empty string for empty input", () => {
    expect(stripControl("")).toBe("");
  });
});

// ── buildInputHandler – Alt+Enter (newline insertion) ────────────────────────

describe("buildInputHandler – Alt+Enter", () => {
  test("inserts a newline into the value", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("hello", onChange, mock(() => {}));
    handler("", makeKey({ return: true, meta: true }));
    expect(onChange).toHaveBeenCalledWith("hello\n");
  });

  test("does not call onSubmit", () => {
    const onSubmit = mock(() => {});
    const handler = buildInputHandler("hello", mock(() => {}), onSubmit);
    handler("", makeKey({ return: true, meta: true }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("does not clear the input", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("hello", onChange, mock(() => {}));
    handler("", makeKey({ return: true, meta: true }));
    // onChange is called with value + newline, NOT with ""
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("hello\n");
  });
});

// ── buildInputHandler – Delete key ───────────────────────────────────────────

describe("buildInputHandler – Delete key", () => {
  test("removes the last character", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("hello", onChange, mock(() => {}));
    handler("", makeKey({ delete: true }));
    expect(onChange).toHaveBeenCalledWith("hell");
  });

  test("does not call onSubmit", () => {
    const onSubmit = mock(() => {});
    const handler = buildInputHandler("hello", mock(() => {}), onSubmit);
    handler("", makeKey({ delete: true }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ── buildInputHandler – control character filtering ──────────────────────────

describe("buildInputHandler – control char filtering", () => {
  test("does not append DEL character (0x7F) to value", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("hello", onChange, mock(() => {}));
    handler("\x7F", makeKey());
    expect(onChange).not.toHaveBeenCalled();
  });

  test("does not append C0 control chars to value", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("hello", onChange, mock(() => {}));
    handler("\x01", makeKey());
    expect(onChange).not.toHaveBeenCalled();
  });

  test("appends printable portion when mixed with control chars", () => {
    const onChange = mock(() => {});
    const handler = buildInputHandler("hello", onChange, mock(() => {}));
    handler("a\x01b", makeKey());
    expect(onChange).toHaveBeenCalledWith("helloab");
  });
});
