import { parseArgs } from 'node:util';

import { resolveSession, tap } from '../../tap';
import { redirectConsoleToStderr } from '../../utils/redirectConsole';
import { formatPrettyEvent, shouldColorizeStream } from '../../utils/pretty';
import { parseHelp, parseSharedTapOptions, tapArgOptions } from '../shared';

export async function runTapCli(args: string[]) {
  if (parseHelp(args)) {
    printTapHelp();
    return;
  }
  const options = parseTapOptions(args);
  if (options.json) redirectConsoleToStderr();
  const session = await resolveSession(options.selector);
  const colorizePretty = shouldColorizeStream(process.stdout);
  for await (const event of tap(session.sessionDir, options)) {
    if (options.pretty) {
      process.stdout.write(
        `${formatPrettyEvent(event, {
          colorize: colorizePretty,
          stream: process.stdout,
        })}\n`
      );
    } else {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    }
  }
}

function parseTapOptions(args: string[]) {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      ...tapArgOptions,
      format: { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const tapOptions = parseSharedTapOptions(parsed.values);
  if (parsed.values.json && parsed.values.format === 'pretty')
    throw new Error('Use either --json or --format pretty, not both');

  return {
    selector: parsed.positionals[0],
    since: tapOptions.since,
    follow: tapOptions.follow,
    filter: tapOptions.filter,
    spans: tapOptions.spans,
    debug: tapOptions.debug,
    json: parsed.values.json ?? false,
    pretty: parsed.values.json ? false : parsed.values.format === 'pretty',
  };
}

function printTapHelp() {
  process.stdout.write(
    [
      'Usage: 2g tap [selector]',
      '',
      'Options:',
      '  selector                 Match by PID, command, or cwd',
      '  --since <time>           Duration, Unix time, or ISO date',
      '  --filter <pattern>       category[:kind], wildcards allowed',
      '  --spans                  Show only events with span durations',
      '  --debug                  Include debug-level events',
      '  --format pretty          Print a readable line per event',
      '  --tail                   Follow live events after replaying history',
      '',
    ].join('\n')
  );
}
