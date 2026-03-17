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
