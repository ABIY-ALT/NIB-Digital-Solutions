/**
 * Exit codes are part of the CLI contract (scripts, cron jobs and pipelines
 * branch on them). Keep them stable.
 */
export const ExitCode = {
  OK: 0,
  /** The command ran and failed (database down, business rule, unexpected error). */
  ERROR: 1,
  /** A check ran and found a problem (broken audit chain, invalid config, pending migrations). */
  CHECK_FAILED: 2,
  /** A safety control stopped the command (no confirmation, missing reason, four-eyes policy). */
  REFUSED: 3,
  /** Wrong arguments (sysexits EX_USAGE). */
  USAGE: 64,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/** The command line itself is wrong: unknown command or option, missing argument. */
export class UsageError extends Error {
  constructor(
    message: string,
    /** Command to show help for (omit for the global help hint). */
    readonly command?: string,
  ) {
    super(message);
    this.name = 'UsageError';
  }
}

/** A safety control refused to run the command. */
export class RefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefusedError';
  }
}
