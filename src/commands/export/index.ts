import fs from 'node:fs';
import { parseArgs } from 'node:util';

import { resolveSession, tap } from '../../tap';
import type { ParsedEvent } from '../../types';
import { redirectConsoleToStderr } from '../../utils/redirectConsole';
import {
  filterEvents,
  formatSessionProcessName,
  parseHelp,
  parseDuration,
  parseSharedTapOptions,
  readJsonlFile,
  readJsonlStdin,
  tapArgOptions,
  warnOnRotationLoss,
} from '../shared';
import { convertToChromeTrace } from './chromeTrace';
import { convertToOpenTelemetry } from './opentelemetry';

type ExportFormat = 'chrome-trace' | 'opentelemetry';
const DEFAULT_IDLE_TIMEOUT = 30_000;

export async function runExportCli(args: string[]) {
  if (parseHelp(args)) {
    printExportHelp();
    return;
  }
  const options = parseExportOptions(args);
  if (options.json) redirectConsoleToStderr();
  let events: AsyncIterable<ParsedEvent> | ParsedEvent[];
  let processName: string | undefined;
  let exportPid: number | undefined;

  if (options.selector) {
    const session = await resolveSession(options.selector);
    processName = formatSessionProcessName(session);
    exportPid = session.pid;
    await warnOnRotationLoss(session.sessionDir, '2g export');
    events = tap(session.sessionDir, {
      follow: options.follow,
      debug: options.debug,
      timeout: options.timeout,
      idleTimeout: options.follow ? options.idleTimeout : undefined,
    });
  } else if (options.inputFile) {
    events = readJsonlFile(options.inputFile);
  } else {
    events = readJsonlStdin();
  }

  const filteredEvents = filterEvents(events, options);
  const file =
    options.format === 'opentelemetry'
      ? await convertToOpenTelemetry(filteredEvents, {
          pid: exportPid,
          processName,
        })
      : await convertToChromeTrace(filteredEvents, {
          pid: exportPid,
          processName,
        });
  const output = JSON.stringify(file, null, 2);
  if (options.output) fs.writeFileSync(options.output, `${output}\n`);
  else process.stdout.write(`${output}\n`);
}

function parseExportOptions(args: string[]) {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      ...tapArgOptions,
      input: { type: 'string' },
      output: { type: 'string', short: 'o' },
      format: { type: 'string' },
      json: { type: 'boolean' },
      timeout: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const tapOptions = parseSharedTapOptions(parsed.values);
  const timeout = parseDuration(parsed.values.timeout);

  const format = parsed.values.format ?? 'chrome-trace';
  if (!isExportFormat(format)) throw new Error(`Unsupported format: ${format}`);
  if (parsed.positionals[0] && parsed.values.input)
    throw new Error('Use either a session selector or --input, not both');
  if (timeout != null && !tapOptions.follow)
    throw new Error('Use --timeout only with --tail');

  return {
    selector: parsed.positionals[0],
    inputFile: parsed.values.input,
    output: parsed.values.output,
    format,
    since: tapOptions.since,
    filter: tapOptions.filter,
    spans: tapOptions.spans,
    debug: tapOptions.debug,
    follow: tapOptions.follow,
    timeout,
    idleTimeout: DEFAULT_IDLE_TIMEOUT,
    json: parsed.values.json ?? false,
  };
}

function isExportFormat(value: string): value is ExportFormat {
  return value === 'chrome-trace' || value === 'opentelemetry';
}

function printExportHelp() {
  process.stdout.write(
    [
      'Usage: 2g export [selector]',
      '',
      'Exports session events to Chrome Trace or OTLP JSON.',
      '',
      'Prefer --tail to capture a run end-to-end: start it before the workload and it',
      'replays history, follows live, and self-terminates on 30s idle. Without --tail',
      'it exports only the retained window, which may be partial under load.',
      '',
      'Options:',
      '  selector                 Substring of PID, CWD, or command; a running',
      '                           session wins ties',
      '  --input <file>           Read JSONL events from a file',
      '  -o, --output <file>      Write output to a file',
      '  --format <format>        chrome-trace or opentelemetry',
      '  --json                   Print JSON output',
      '  --since <time>           Duration ago (5m, 90s), Unix time, or ISO date',
      '  --filter <pattern>       Event name prefix (whole segments), e.g. category,',
      '                           category:kind; * wildcards; comma-separated',
      '  --spans                  Keep only span events (log.span() pairs with a _d',
      '                           duration); omit to include point events too. A',
      '                           plain "ms" payload field is not a span',
      '  --debug                  Include debug events (only recorded when the',
      '                           command ran with LOG_DEBUG set)',
      '  --tail                   Follow live events after replaying history, then',
      '                           stop automatically after 30s with no new events',
      '  --timeout <duration>     Also stop tailing after this absolute duration',
      '',
    ].join('\n')
  );
}
