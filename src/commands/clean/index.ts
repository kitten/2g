import { parseArgs } from 'node:util';

import { cleanExitedSessionsSync, cleanStaleSessionsSync } from '../../clean';
import { redirectConsoleToStderr } from '../../utils/redirectConsole';

export function runCleanCli(args: string[] = []) {
  const options = parseCleanOptions(args);
  if (options.json) redirectConsoleToStderr();
  const removed = options.all
    ? cleanExitedSessionsSync()
    : cleanStaleSessionsSync();
  process.stdout.write(
    options.json
      ? `${JSON.stringify({ removed })}\n`
      : `Removed ${removed} ${options.all ? 'exited' : 'stale'} sessions.\n`
  );
}

function parseCleanOptions(args: string[]) {
  const parsed = parseArgs({
    args,
    options: {
      all: { type: 'boolean', short: 'a' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  return {
    all: parsed.values.all === true,
    json: parsed.values.json === true,
  };
}

export function printCleanHelp() {
  process.stdout.write(
    [
      'Usage: 2g clean',
      '',
      'Options:',
      '  --all, -a              Remove all exited sessions',
      '  --json',
      '',
    ].join('\n')
  );
}
