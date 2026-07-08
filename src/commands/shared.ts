import fs from 'node:fs';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { parseArgs } from 'node:util';

import type { ListedSession } from '../tap';
import {
  compileEventFilter,
  matchesTapOptions,
  parseEventLine,
  parseSince,
  parseDuration as parseDurationValue,
} from '../utils/eventFilter';
import type { ParsedEvent } from '../types';

export const tapArgOptions = {
  since: { type: 'string' },
  filter: { type: 'string', multiple: true },
  spans: { type: 'boolean' },
  debug: { type: 'boolean' },
  tail: { type: 'boolean' },
} as const;

export interface SharedTapOptions {
  since?: string;
  filter?: string[];
  spans?: boolean;
  debug?: boolean;
  follow: boolean;
}

export function formatSessionProcessName(session: ListedSession) {
  return session.version
    ? `${session.command} (v${session.version}, PID ${session.pid})`
    : `${session.command} (PID ${session.pid})`;
}

export async function* readJsonlFile(file: string) {
  yield* readJsonlStream(fs.createReadStream(file, { encoding: 'utf8' }));
}

export async function* readJsonlStdin() {
  yield* readJsonlStream(process.stdin);
}

export async function* readJsonlStream(stream: Readable) {
  const rl = createInterface({ input: stream });
  for await (const line of rl) {
    if (!line) continue;
    // Lossless parse; the debug decision belongs to filterEvents
    const event = parseEventLine(line, { debug: true });
    if (event) yield event;
  }
}

export async function* filterEvents(
  events: AsyncIterable<ParsedEvent> | Iterable<ParsedEvent>,
  options: Pick<SharedTapOptions, 'since' | 'filter' | 'spans' | 'debug'>
) {
  const eventFilter = compileEventFilter(options.filter);
  const since = parseSince(options.since);
  for await (const event of events) {
    if (
      matchesTapOptions(
        event,
        {
          filter: options.filter,
          since,
          spans: options.spans,
          debug: options.debug,
        },
        eventFilter
      )
    )
      yield event;
  }
}

export function parseSharedTapOptions(values: {
  since?: string;
  filter?: string[];
  spans?: boolean;
  debug?: boolean;
  tail?: boolean;
}): SharedTapOptions {
  return {
    since: values.since,
    filter: values.filter
      ?.flatMap(value => value.split(','))
      .map(item => item.trim())
      .filter(Boolean),
    spans: values.spans === true,
    debug: values.debug === true,
    follow: values.tail === true,
  };
}

export function parseHelp(args: string[]) {
  return (
    parseArgs({
      args,
      allowPositionals: true,
      strict: false,
      options: {
        help: { type: 'boolean', short: 'h' },
      },
    }).values.help === true
  );
}

export function parseJsonFlag(args: string[]) {
  return parseArgs({
    args,
    allowPositionals: true,
    options: {
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  }).values;
}

export function parseDuration(value?: string) {
  if (value == null || value === '') return undefined;
  const duration = parseDurationValue(value);
  if (duration == null) throw new Error(`Invalid duration: ${value}`);
  return duration;
}
