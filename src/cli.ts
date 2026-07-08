#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { printCleanHelp, runCleanCli } from './commands/clean';
import { runExportCli } from './commands/export';
import { printPsHelp, runPsCli } from './commands/ps';
import { runTapCli } from './commands/tap';
import { parseHelp } from './commands/shared';

export async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return 0;
  }

  switch (command) {
    case 'typegen': {
      const { runTypegenCli } = await import('./commands/typegen');
      runTypegenCli(args);
      return 0;
    }
    case 'ps':
      if (parseHelp(args)) {
        printPsHelp();
        return 0;
      }
      await runPsCli(args);
      return 0;
    case 'tap':
      await runTapCli(args);
      return 0;
    case 'clean':
      if (parseHelp(args)) {
        printCleanHelp();
        return 0;
      }
      runCleanCli(args);
      return 0;
    case 'export':
      await runExportCli(args);
      return 0;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: 2g <command>',
      '',
      'Commands:',
      '  ps [selector]                 List sessions; selector matches PID, command, or cwd',
      '    --json',
      '',
      '  tap [selector]                Replay session events as JSONL',
      '    --since <time> --filter <prefix> --tail --format pretty',
      '',
      '  export [selector]             Export events to Chrome Trace or OTLP JSON',
      '    --input <file> -o <file> --format <format> --filter <prefix> --tail',
      '',
      '  typegen                       Generate merged EventRegistry schema',
      '    --project <file> --output <file> --format dts|json --json',
      '',
      '  clean                         Remove stale sessions',
      '    --json',
      '',
      'Run 2g <command> --help for full command help.',
      '',
    ].join('\n')
  );
}

if (isCliEntrypoint()) {
  main()
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`
      );
      process.exitCode = 1;
    });
}

function isCliEntrypoint() {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}
