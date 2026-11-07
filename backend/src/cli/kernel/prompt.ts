import { createInterface } from 'node:readline';
import { RefusedError, UsageError } from './errors.js';

/** Terminal interaction, behind an interface so commands can be tested without a TTY. */
export interface Terminal {
  readonly interactive: boolean;
  ask(question: string): Promise<string>;
  /** Reads a line without echoing it. */
  askHidden(question: string): Promise<string>;
  /** Everything piped into standard input. */
  readPiped(): Promise<string>;
}

export class ProcessTerminal implements Terminal {
  get interactive(): boolean {
    return Boolean(process.stdin.isTTY && process.stderr.isTTY);
  }

  ask(question: string): Promise<string> {
    // Prompts go to stderr so stdout stays clean for --json and pipes.
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  askHidden(question: string): Promise<string> {
    const { stdin, stderr } = process;
    stderr.write(question);
    return new Promise((resolve, reject) => {
      let value = '';
      const finish = (error?: Error): void => {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        stderr.write('\n');
        if (error) reject(error);
        else resolve(value);
      };
      const onData = (chunk: Buffer): void => {
        for (const char of chunk.toString('utf8')) {
          if (char === '\r' || char === '\n') return finish();
          if (char === '\u0003') return finish(new RefusedError('Cancelled.'));
          if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
          else value += char;
        }
      };
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on('data', onData);
    });
  }

  async readPiped(): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  }
}

/**
 * Confirmation gate. `--yes` answers it; without a terminal the command is
 * refused instead of silently proceeding (or hanging in a pipeline).
 */
export async function confirm(
  terminal: Terminal,
  question: string,
  assumeYes: boolean,
): Promise<void> {
  if (assumeYes) return;
  if (!terminal.interactive) {
    throw new RefusedError(
      `${question}\n  Not running on a terminal: pass --yes to confirm in scripts and pipelines.`,
    );
  }
  const answer = await terminal.ask(`${question} Type "yes" to continue: `);
  if (answer.toLowerCase() !== 'yes') throw new RefusedError('Not confirmed. Nothing was changed.');
}

/**
 * Secrets never travel in arguments (they would land in shell history and the
 * process list): they are piped in, or typed at a hidden prompt.
 */
export async function readSecret(terminal: Terminal, prompt: string): Promise<string> {
  if (!terminal.interactive) {
    const piped = (await terminal.readPiped()).replace(/\r?\n$/, '');
    if (!piped) throw new UsageError('Expected the secret on standard input, but it was empty.');
    return piped;
  }
  const first = await terminal.askHidden(`${prompt}: `);
  const second = await terminal.askHidden(`${prompt} (again): `);
  if (first !== second) throw new UsageError('The two entries do not match.');
  if (!first) throw new UsageError('The secret cannot be empty.');
  return first;
}
