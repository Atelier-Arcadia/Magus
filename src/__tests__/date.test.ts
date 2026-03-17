import { describe, expect, test } from "bun:test";
import { dateTool, formatDate } from "../tools/date";

// ── formatDate – output types ────────────────────────────────────────────────

describe("formatDate – output types", () => {
  const date = new Date(2026, 0, 5, 9, 3, 7); // Jan 5 2026 09:03:07

  test("year is a number", () => {
    expect(typeof formatDate(date).year).toBe("number");
  });

  test("hours is a number", () => {
    expect(typeof formatDate(date).hours).toBe("number");
  });

  test("month is a string", () => {
    expect(typeof formatDate(date).month).toBe("string");
  });

  test("day is a string", () => {
    expect(typeof formatDate(date).day).toBe("string");
  });

  test("minutes is a string", () => {
    expect(typeof formatDate(date).minutes).toBe("string");
  });

  test("seconds is a string", () => {
    expect(typeof formatDate(date).seconds).toBe("string");
  });
});

// ── formatDate – zero-padding ─────────────────────────────────────────────────

describe("formatDate – zero-padding of single-digit values", () => {
  // Jan 5 2026 09:03:07 → month=01, day=05, minutes=03, seconds=07
  const singleDigit = new Date(2026, 0, 5, 9, 3, 7);

  test("month is zero-padded to 2 characters", () => {
    expect(formatDate(singleDigit).month).toBe("01");
  });

  test("day is zero-padded to 2 characters", () => {
    expect(formatDate(singleDigit).day).toBe("05");
  });

  test("minutes is zero-padded to 2 characters", () => {
    expect(formatDate(singleDigit).minutes).toBe("03");
  });

  test("seconds is zero-padded to 2 characters", () => {
    expect(formatDate(singleDigit).seconds).toBe("07");
  });
});

// ── formatDate – double-digit values ─────────────────────────────────────────

describe("formatDate – double-digit values are not over-padded", () => {
  // Dec 25 2026 14:30:45 → month=12, day=25, minutes=30, seconds=45
  const doubleDigit = new Date(2026, 11, 25, 14, 30, 45);

  test("month is exactly 2 characters for double-digit month", () => {
    expect(formatDate(doubleDigit).month).toBe("12");
  });

  test("day is exactly 2 characters for double-digit day", () => {
    expect(formatDate(doubleDigit).day).toBe("25");
  });

  test("minutes is exactly 2 characters for double-digit minutes", () => {
    expect(formatDate(doubleDigit).minutes).toBe("30");
  });

  test("seconds is exactly 2 characters for double-digit seconds", () => {
    expect(formatDate(doubleDigit).seconds).toBe("45");
  });
});

// ── formatDate – hours range 1-24 ────────────────────────────────────────────

describe("formatDate – hours is a number in range 1-24", () => {
  test("midnight (getHours = 0) maps to 24", () => {
    const midnight = new Date(2026, 0, 1, 0, 0, 0);
    expect(formatDate(midnight).hours).toBe(24);
  });

  test("1am (getHours = 1) maps to 1", () => {
    const oneAm = new Date(2026, 0, 1, 1, 0, 0);
    expect(formatDate(oneAm).hours).toBe(1);
  });

  test("noon (getHours = 12) maps to 12", () => {
    const noon = new Date(2026, 0, 1, 12, 0, 0);
    expect(formatDate(noon).hours).toBe(12);
  });

  test("23:00 (getHours = 23) maps to 23", () => {
    const elevenPm = new Date(2026, 0, 1, 23, 0, 0);
    expect(formatDate(elevenPm).hours).toBe(23);
  });
});

// ── formatDate – correct year and full field values ───────────────────────────

describe("formatDate – correct field values", () => {
  const date = new Date(2026, 5, 15, 10, 20, 30); // Jun 15 2026 10:20:30

  test("year matches the input date's full year", () => {
    expect(formatDate(date).year).toBe(2026);
  });

  test("month matches the input date's month (1-based)", () => {
    expect(formatDate(date).month).toBe("06");
  });

  test("day matches the input date's day", () => {
    expect(formatDate(date).day).toBe("15");
  });

  test("hours matches the input date's hours", () => {
    expect(formatDate(date).hours).toBe(10);
  });

  test("minutes matches the input date's minutes", () => {
    expect(formatDate(date).minutes).toBe("20");
  });

  test("seconds matches the input date's seconds", () => {
    expect(formatDate(date).seconds).toBe("30");
  });
});

// ── dateTool – response shape ─────────────────────────────────────────────────

describe("dateTool – response structure", () => {
  test("returns a content array with exactly one item", async () => {
    const result = await dateTool().handler({}, {});
    expect(result.content).toHaveLength(1);
  });

  test("the content item has type 'text'", async () => {
    const result = await dateTool().handler({}, {});
    expect(result.content[0].type).toBe("text");
  });

  test("the text field is valid JSON", async () => {
    const result = await dateTool().handler({}, {});
    const { text } = result.content[0] as { type: "text"; text: string };
    expect(() => JSON.parse(text)).not.toThrow();
  });

  test("parsed JSON contains all six required keys", async () => {
    const result = await dateTool().handler({}, {});
    const { text } = result.content[0] as { type: "text"; text: string };
    const parsed = JSON.parse(text);
    expect(parsed).toHaveProperty("year");
    expect(parsed).toHaveProperty("month");
    expect(parsed).toHaveProperty("day");
    expect(parsed).toHaveProperty("hours");
    expect(parsed).toHaveProperty("minutes");
    expect(parsed).toHaveProperty("seconds");
  });
});

// ── dateTool – field types in JSON output ─────────────────────────────────────

describe("dateTool – JSON field types", () => {
  async function parsedResult() {
    const result = await dateTool().handler({}, {});
    const { text } = result.content[0] as { type: "text"; text: string };
    return JSON.parse(text);
  }

  test("year is a number", async () => {
    expect(typeof (await parsedResult()).year).toBe("number");
  });

  test("hours is a number", async () => {
    expect(typeof (await parsedResult()).hours).toBe("number");
  });

  test("month is a string", async () => {
    expect(typeof (await parsedResult()).month).toBe("string");
  });

  test("day is a string", async () => {
    expect(typeof (await parsedResult()).day).toBe("string");
  });

  test("minutes is a string", async () => {
    expect(typeof (await parsedResult()).minutes).toBe("string");
  });

  test("seconds is a string", async () => {
    expect(typeof (await parsedResult()).seconds).toBe("string");
  });
});

// ── dateTool – zero-padding and hours range in live output ────────────────────

describe("dateTool – zero-padding invariant in live output", () => {
  async function parsedResult() {
    const result = await dateTool().handler({}, {});
    const { text } = result.content[0] as { type: "text"; text: string };
    return JSON.parse(text);
  }

  test("month is always exactly 2 characters", async () => {
    expect((await parsedResult()).month).toHaveLength(2);
  });

  test("day is always exactly 2 characters", async () => {
    expect((await parsedResult()).day).toHaveLength(2);
  });

  test("minutes is always exactly 2 characters", async () => {
    expect((await parsedResult()).minutes).toHaveLength(2);
  });

  test("seconds is always exactly 2 characters", async () => {
    expect((await parsedResult()).seconds).toHaveLength(2);
  });

  test("hours is a number between 1 and 24 inclusive", async () => {
    const { hours } = await parsedResult();
    expect(hours).toBeGreaterThanOrEqual(1);
    expect(hours).toBeLessThanOrEqual(24);
  });
});
