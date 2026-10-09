import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { runRecordCli } from '../index';

describe('record command', () => {
  it.each(['chrome-trace', 'opentelemetry'])(
    'preserves the latest parent version when filtering %s recordings',
    async format => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-record-'));
      const output = path.join(dir, 'trace.json');
      const events = [
        { _e: 'root:init', _t: 1, version: '1' },
        { _e: 'root:update', _t: 2, version: '2' },
        { _e: 'root:init', _t: 3, _w: 'child:1', version: 'child' },
        { _e: 'other:done', _t: 4 },
        { _e: 'build:bundle', _t: 5, _d: 1 },
      ];
      const script = `require('node:fs').writeSync(3, ${JSON.stringify(
        events.map(event => JSON.stringify(event) + '\n').join('')
      )});`;

      try {
        await runRecordCli([
          '--format',
          format,
          '--filter',
          'build',
          '-o',
          output,
          '--',
          process.execPath,
          '-e',
          script,
        ]);
        const trace = JSON.parse(await fs.readFile(output, 'utf8'));
        if (format === 'chrome-trace') {
          expect(trace.metadata.version).toBe('2');
          expect(trace.traceEvents.filter(event => event.ph !== 'M')).toEqual([
            expect.objectContaining({ name: 'bundle', cat: 'build' }),
          ]);
        } else {
          const resource = trace.resourceSpans[0];
          expect(resource.resource.attributes).toContainEqual({
            key: 'service.version',
            value: { stringValue: '2' },
          });
          const spans = resource.scopeSpans[0].spans;
          expect(spans).toHaveLength(2);
          expect(spans[0].events).toBeUndefined();
          expect(spans[1].attributes).toContainEqual({
            key: 'event.name',
            value: { stringValue: 'build:bundle' },
          });
        }
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  );

  it('runs a command and traces the events it emits to a file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-record-'));
    const output = path.join(dir, 'trace.json');
    // A minimal instrumented child: write one span event to the capture pipe (fd 3)
    const script =
      'const fs=require("fs");' +
      'fs.writeSync(3,JSON.stringify({_e:"build:bundle",_t:Date.now(),_d:42})+"\\n");';

    try {
      await runRecordCli(['-o', output, '--', process.execPath, '-e', script]);
      const parsed = JSON.parse(await fs.readFile(output, 'utf8'));
      expect(JSON.stringify(parsed)).toContain('build:bundle');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it.each(['chrome-trace', 'opentelemetry'])(
    'honors --debug for %s',
    async format => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-record-'));
      const output = path.join(dir, 'trace.json');
      const script =
        'require("fs").writeSync(3,JSON.stringify({_e:"build:debug",_t:Date.now(),_l:1})+"\\n");';
      try {
        for (const debug of [false, true]) {
          await runRecordCli([
            '--format',
            format,
            ...(debug ? ['--debug'] : []),
            '-o',
            output,
            '--',
            process.execPath,
            '-e',
            script,
          ]);
          const trace = JSON.parse(await fs.readFile(output, 'utf8'));
          const events =
            format === 'chrome-trace'
              ? trace.traceEvents
              : (trace.resourceSpans[0].scopeSpans[0].spans[0].events ?? []);
          expect(
            events.some((event: { name: string }) => event.name === 'debug')
          ).toBe(debug);
        }
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  );

  it('errors when no command is given', async () => {
    await expect(runRecordCli(['-o', 'trace.json'])).rejects.toThrow(
      'record needs a command to run'
    );
  });

  it('prints help describing the spawn-and-trace model', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    try {
      await runRecordCli(['--help']);
      const output = String(write.mock.calls[0][0]);
      expect(output).toContain('-- <command>');
      expect(output).toContain('traces the events it emits');
      expect(output).toContain('LOG_EVENTS=<file>');
    } finally {
      write.mockRestore();
    }
  });
});
