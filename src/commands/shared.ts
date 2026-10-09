import fs from 'node:fs';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { parseArgs } from 'node:util';

import { detectRotationLoss } from '../tap';
import {
  parseEventLine,
  parseDuration as parseDurationValue,
} from '../utils/eventFilter';

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

// Warns (via console.warn → stderr, so it never pollutes the JSON/JSONL on
// stdout, and stays mockable in tests) when segment rotation has already
// dropped the start of the run from the retained window.
export async function warnOnRotationLoss(sessionDir: string, remedy: string) {
  if (!(await detectRotationLoss(sessionDir))) return;
  console.warn(
    `⚠ Earlier events were rotated out of the retained window.\n` +
      `  For a complete trace, start \`${remedy}\` before the workload.`
  );
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
    // Lossless parse; filtering belongs to the converters
    const event = parseEventLine(line, { debug: true });
    if (event) yield event;
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
