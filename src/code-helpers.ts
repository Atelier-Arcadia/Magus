/**
 * Parse the value of the `--resume` flag from a CLI args array.
 *
 * @returns The session ID string if `--resume <id>` is present, otherwise `undefined`.
 */
export function parseResumeSessionId(args: string[]): string | undefined {
  const idx = args.indexOf("--resume");
  return idx !== -1 ? args[idx + 1] : undefined;
}

/**
 * Return the session ID to pass into `orchestrator.run()`, but only on the
 * first turn of a resumed session. On all subsequent turns the orchestrator
 * tracks the session internally, so we pass `undefined`.
 *
 * @param resumeSessionId - The session ID from CLI args (may be `undefined`).
 * @param hasResumed      - Whether we have already forwarded the session ID.
 */
export function selectSessionId(
  resumeSessionId: string | undefined,
  hasResumed: boolean,
): string | undefined {
  return !hasResumed && resumeSessionId ? resumeSessionId : undefined;
}

/**
 * Parse the value of the `--prompt` / `-p` flag from a CLI args array.
 * When both forms are present, the one that appears first wins.
 *
 * @returns The prompt-file path string if found, otherwise `undefined`.
 */
export function parsePromptFlag(args: string[]): string | undefined {
  const longIdx = args.indexOf("--prompt");
  const shortIdx = args.indexOf("-p");
  if (longIdx === -1 && shortIdx === -1) return undefined;
  const idx =
    longIdx === -1 ? shortIdx
    : shortIdx === -1 ? longIdx
    : Math.min(longIdx, shortIdx);
  return args[idx + 1];
}

/**
 * Check whether the `--auto-approve` boolean flag is present in a CLI args array.
 *
 * @returns `true` if `--auto-approve` appears exactly (no partial matches).
 */
export function parseAutoApprove(args: string[]): boolean {
  return args.includes("--auto-approve");
}

/**
 * Check whether the `-H` / `--hide-tools` boolean flag is present in a CLI args array.
 *
 * @returns `true` if `-H` or `--hide-tools` appears exactly (no partial matches).
 */
export function parseHideTools(args: string[]): boolean {
  return args.includes("-H") || args.includes("--hide-tools");
}

/**
 * Check whether the `-v` / `--verbose` boolean flag is present in a CLI args array.
 *
 * @returns `true` if `-v` or `--verbose` appears exactly (no partial matches).
 */
export function parseVerbose(args: string[]): boolean {
  return args.includes("-v") || args.includes("--verbose");
}

/**
 * Read prompt text from a file path or, when `promptFile` is `undefined`, from stdin.
 * Trims surrounding whitespace from the result.
 *
 * @throws {Error} If the file does not exist, the file is empty, or stdin yields nothing.
 */
export async function readPrompt(promptFile: string | undefined): Promise<string> {
  if (promptFile !== undefined) {
    const file = Bun.file(promptFile);
    if (!(await file.exists()))
      throw new Error(`Prompt file not found: ${promptFile}`);
    const text = (await file.text()).trim();
    if (text.length === 0)
      throw new Error(`Prompt file is empty: ${promptFile}`);
    return text;
  }
  const text = (await Bun.stdin.text()).trim();
  if (text.length === 0) throw new Error("No prompt was provided.");
  return text;
}
