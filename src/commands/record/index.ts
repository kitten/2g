import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { parseArgs } from 'node:util';

import { captureEvents } from '../../capture';
import { redirectConsoleToStderr } from '../../utils/redirectConsole';
import { filterEvents, parseHelp } from '../shared';
import { convertToChromeTrace } from '../export/chromeTrace';
import { convertToOpenTelemetry } from '../export/opentelemetry';

type ExportFormat = 'chrome-trace' | 'opentelemetry';

// `record` owns the process it traces: it spawns <command> with event capture
// wired in, follows its events end-to-end, and writes the trace when it exits.
// This is the reliable path for a one-off run — there is no window to attach
// within and nothing to rotate out, so it never returns a partial trace.
export async function runRecordCli(args: string[]) {
  if (parseHelp(args)) {
    printRecordHelp();
    return;
  }

  // Everything after `--` is the command and its own arguments, verbatim
  const separator = args.indexOf('--');
  const ownArgs = separator === -1 ? args : args.slice(0, separator);
  const command = separator === -1 ? [] : args.slice(separator + 1);
  const options = parseRecordOptions(ownArgs);
  if (!command.length)
    throw new Error(
      'record needs a command to run: 2g record [options] -- <command> [args...]'
    );

  if (options.json) redirectConsoleToStderr();

  const capture = captureEvents({
    debug: options.debug,
    filter: options.filter,
  });
  // The trace lands on stdout when there is no -o, so route the child's stdout
  // to stderr to keep it clean; with -o the child can use stdout normally.
  const child = spawn(
    command[0],
    command.slice(1),
    capture.spawnOptions({
      env: process.env,
      stdio: ['inherit', options.output ? 'inherit' : 2, 'inherit'],
    })
  );
  capture.attach(child);

  const exited = new Promise<number>((resolve, reject) => {
    child.on('exit', code => resolve(code ?? 0));
    child.on('error', error =>
      reject(new Error(`Failed to run ${command[0]}: ${error.message}`))
    );
  });

  const meta = { pid: child.pid, processName: command.join(' ') };
  const filtered = filterEvents(capture, options);
  // Draining the events resolves once the child closes its event pipe (on exit)
  const file =
    options.format === 'opentelemetry'
      ? await convertToOpenTelemetry(filtered, meta)
      : await convertToChromeTrace(filtered, meta);
  const exitCode = await exited;

  const output = JSON.stringify(file, null, 2);
  if (options.output) fs.writeFileSync(options.output, `${output}\n`);
  else process.stdout.write(`${output}\n`);

  if (exitCode) process.exitCode = exitCode;
}

function parseRecordOptions(args: string[]) {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      filter: { type: 'string', multiple: true },
      spans: { type: 'boolean' },
      debug: { type: 'boolean' },
      output: { type: 'string', short: 'o' },
      format: { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const format = parsed.values.format ?? 'chrome-trace';
  if (!isExportFormat(format)) throw new Error(`Unsupported format: ${format}`);

  return {
    output: parsed.values.output,
    format,
    filter: parsed.values.filter
      ?.flatMap(value => value.split(','))
      .map(item => item.trim())
      .filter(Boolean),
    spans: parsed.values.spans === true,
    debug: parsed.values.debug === true,
    json: parsed.values.json ?? false,
  };
}

function isExportFormat(value: string): value is ExportFormat {
  return value === 'chrome-trace' || value === 'opentelemetry';
}

function printRecordHelp() {
  process.stdout.write(
    [
      'Usage: 2g record [options] -- <command> [args...]',
      '',
      'Runs <command>, traces the events it emits, and writes the trace on exit.',
      '',
      'This is the reliable way to capture a one-off run (a build, a script): 2g',
      'owns the process, so the trace is complete end-to-end with no window to',
      'attach within and nothing to rotate out. To trace an already-running server',
      'instead, use `2g export <selector> --tail`.',
      '',
      'Options:',
      '  -o, --output <file>      Write the trace to a file (default: stdout)',
      '  --format <format>        chrome-trace or opentelemetry',
      '  --json                   Print JSON output',
      '  --filter <pattern>       Event name prefix (whole segments), e.g. category,',
      '                           category:kind; * wildcards; comma-separated',
      '  --spans                  Keep only span events (log.span() pairs with a _d',
      '                           duration); omit to include point events too',
      '  --debug                  Include debug events (no LOG_DEBUG needed here)',
      '',
      'Example:',
      '  2g record -o trace.json -- expo export   # run & trace a build end-to-end',
      '',
    ].join('\n')
  );
}
