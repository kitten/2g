import { parseArgs } from 'node:util';

import { resolveSession, tap } from '../../tap';
import { redirectConsoleToStderr } from '../../utils/redirectConsole';
import { formatPrettyEvent, shouldColorizeStream } from '../../utils/pretty';
import {
  parseHelp,
  parseSharedTapOptions,
  tapArgOptions,
  warnOnRotationLoss,
} from '../shared';

export async function runTapCli(args: string[]) {
  if (parseHelp(args)) {
    printTapHelp();
    return;
  }
  const options = parseTapOptions(args);
  if (options.json) redirectConsoleToStderr();
  const session = await resolveSession(options.selector);
  await warnOnRotationLoss(session.sessionDir, '2g tap');
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
      'Replays retained session history as JSONL, oldest first.',
      '',
      'Options:',
      '  selector                 Substring of PID, CWD, or command; a running',
      '                           session wins ties',
      '  --since <time>           Duration ago (5m, 90s), Unix time, or ISO date',
      '  --filter <pattern>       Event name prefix (whole segments), e.g. category,',
      '                           category:kind; * wildcards; comma-separated',
      '  --spans                  Keep only span events (log.span() pairs with a _d',
      '                           duration); omit to include point events too. A',
      '                           plain "ms" payload field is not a span',
      '  --debug                  Include debug events (only recorded when the',
      '                           command ran with LOG_DEBUG set)',
      '  --format pretty          Print a readable line per event',
      '  --tail                   Follow live events after replaying history; runs',
      '                           until killed (use export with a timeout for a',
      '                           bounded follow)',
      '',
    ].join('\n')
  );
}
