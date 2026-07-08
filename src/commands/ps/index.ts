import { parseArgs } from 'node:util';

import { listSessions } from '../../tap';
import { redirectConsoleToStderr } from '../../utils/redirectConsole';

export async function runPsCli(args: string[] = []) {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      active: { type: 'boolean', short: 'a' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (parsed.values.json) redirectConsoleToStderr();
  const sessions = (
    await listSessions({ selector: parsed.positionals[0] })
  ).filter(session => !parsed.values.active || session.alive);
  if (parsed.values.json) {
    process.stdout.write(`${JSON.stringify(sessions, null, 2)}\n`);
    return;
  }

  process.stdout.write('PID\tSTATUS\tSTARTED\tCOMMAND\tCWD\n');
  for (const session of sessions) {
    process.stdout.write(
      `${escapeTsv(session.pid)}\t${escapeTsv(
        session.alive ? 'alive' : 'exited'
      )}\t${escapeTsv(
        new Date(session.startedAt).toISOString()
      )}\t${escapeTsv(session.command)}\t${escapeTsv(session.cwd)}\n`
    );
  }
}

function escapeTsv(value: unknown) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

export function printPsHelp() {
  process.stdout.write(
    [
      'Usage: 2g ps [selector]',
      '',
      'Lists recorded sessions, newest first; alive means still running.',
      '',
      'Options:',
      '  selector                Substring of PID, CWD, or command',
      '  --active, -a            Show only active sessions',
      '  --json                  Print sessions as JSON',
      '',
    ].join('\n')
  );
}
