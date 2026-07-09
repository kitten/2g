#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

import { printCleanHelp, runCleanCli } from './commands/clean';
import { runExportCli } from './commands/export';
import { printPsHelp, runPsCli } from './commands/ps';
import { runRecordCli } from './commands/record';
import { runTapCli } from './commands/tap';
import { parseHelp } from './commands/shared';

export async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;

  if (
    !command ||
    command === '--help' ||
    command === '-h' ||
    command === 'help'
  ) {
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
    case 'record':
      await runRecordCli(args);
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
      'Reads structured JSONL event logs that instrumented CLIs record during runs',
      'into the system temp dir, with no setup: run a command, then tap it here.',
      '',
      'Commands:',
      '  ps [selector]                 List recorded sessions',
      '    --active, -a (running only)  --json',
      '',
      '  tap [selector]                Replay session events as JSONL, oldest first',
      '    --since <time>  --filter <pattern>  --spans  --debug  --format pretty',
      '    --tail (follow live events after replay; runs until killed)',
      '',
      '  record -- <command>          Run a command, trace it end-to-end, write on exit',
      '    -o, --output <file>  --format chrome-trace|opentelemetry  --json',
      '    --filter <pattern>  --spans  --debug',
      '',
      '  export [selector]             Export a past or live (--tail) session',
      '    --input <jsonl-file>  -o, --output <file>  --json',
      '    --format chrome-trace|opentelemetry',
      '    --since <time>  --filter <pattern>  --spans  --debug',
      '    --tail  --timeout <duration> (absolute; tail also stops after 30s idle)',
      '',
      '  typegen                       List every event name/payload a project can emit',
      '    -p, --project <tsconfig>  -o, --output <file>  --format dts|json  --json',
      '',
      '  clean                         Remove stale sessions',
      '    --all, -a (remove all exited sessions)  --json',
      '',
      'Typical use:',
      '  2g ps -a                                         # what is running now?',
      '  2g tap "expo start" --tail                       # follow live events',
      '  2g tap "expo start" --since 5m --format pretty   # recent history, readable',
      '  2g tap "expo start" --filter metro:bundling      # narrow to one area',
      '',
      'Trace a run to a flame chart:',
      '  2g record -o trace.json -- expo export           # run & trace a build',
      '  2g export "expo start" --tail -o trace.json      # attach to a running server',
      '  2g export "expo start" -o trace.json             # after the fact (partial)',
      '',
      'Selectors match sessions by substring of PID, CWD, or command. If several',
      'match, and exactly one of them is running, it is chosen; otherwise 2g errors',
      'and lists the candidates.',
      '',
      '--filter takes comma-separated event-name prefixes matched on whole',
      'segments: "category" and "category:kind" both match "category:kind:test";',
      '* matches anything. Discover names by tapping unfiltered or via typegen.',
      '',
      '--since accepts a duration ago (5m, 90s, 1h30m), Unix time, or ISO date.',
      '--spans keeps only span events (log.span() pairs with a "_d" duration in',
      'ms); without it, point events are included alongside spans.',
      '',
      'Events are single JSON lines: {"_e":"category:kind","_t":<epoch ms>,...}.',
      '"_d" is a span duration, "_w" a worker id; debug events need --debug.',
      '',
      'Set LOG_EVENTS=<file|fd> on an instrumented command to redirect its events.',
      'Debug events are only recorded when the command runs with LOG_DEBUG set.',
      '',
      'Pass LOG_DEBUG=<filter> when debugging; it also mirrors matching events to',
      'stderr. Reading them back needs --debug.',
      '',
      'Run 2g <command> --help for per-command help.',
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
