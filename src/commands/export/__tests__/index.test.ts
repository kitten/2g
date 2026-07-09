import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INTERNAL_IPC_ENV } from '../../../constants';
import { _setSessionBaseDir } from '../../../clean';
import { createSession } from '../../../session';
import { runExportCli } from '../index';

describe('export command', () => {
  // Truncated fixtures trip the rotation-loss warning; keep it out of test output
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to Chrome Trace JSON output', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-export-'));
    const input = path.join(dir, 'events.jsonl');
    const output = path.join(dir, 'trace.json');
    await fs.writeFile(
      input,
      `${JSON.stringify({ _e: 'root:init', _t: 900, version: '1.0.0' })}\n`
    );

    try {
      await runExportCli(['--input', input, '-o', output]);
      const parsed = JSON.parse(await fs.readFile(output, 'utf8'));
      expect(parsed.traceEvents).toEqual(expect.any(Array));
      expect(parsed.metadata.source).toBe('2g');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('routes --format opentelemetry to OTLP JSON output', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-export-'));
    const input = path.join(dir, 'events.jsonl');
    const output = path.join(dir, 'otel.json');
    await fs.writeFile(
      input,
      `${JSON.stringify({ _e: 'root:init', _t: 900, version: '1.0.0' })}\n${JSON.stringify(
        {
          _e: 'metro:bundling:done',
          _t: 1500,
          _d: 250,
        }
      )}\n`
    );

    try {
      await runExportCli([
        '--input',
        input,
        '--format',
        'opentelemetry',
        '-o',
        output,
      ]);
      const parsed = JSON.parse(await fs.readFile(output, 'utf8'));
      expect(parsed.resourceSpans[0].scopeSpans[0].spans[1]).toMatchObject({
        name: 'bundling',
        startTimeUnixNano: '1250000000',
        endTimeUnixNano: '1500000000',
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects unsupported formats', async () => {
    await expect(runExportCli(['--format', 'yaml'])).rejects.toThrow(
      'Unsupported format: yaml'
    );
  });

  it('documents the tail idle timeout fallback', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      await runExportCli(['--help']);
      expect(String(write.mock.calls[0][0])).toContain(
        'stop automatically after 30s with no new events'
      );
    } finally {
      write.mockRestore();
    }
  });

  it('rejects unknown session selectors', async () => {
    await expect(runExportCli(['missing-session'])).rejects.toThrow(
      'No 2g session matching "missing-session"'
    );
  });

  it('accepts --json for JSON stdout output', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-export-'));
    const input = path.join(dir, 'events.jsonl');
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    await fs.writeFile(
      input,
      `${JSON.stringify({ _e: 'root:init', _t: 900, version: '1.0.0' })}\n`
    );

    try {
      await runExportCli(['--input', input, '--json']);
      expect(JSON.parse(String(write.mock.calls[0][0]))).toMatchObject({
        traceEvents: expect.any(Array),
      });
    } finally {
      write.mockRestore();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('exports tapped history without following live events by default', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-export-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const output = path.join(dir, 'trace.json');
    const session = createSession({ command: 'export' });

    try {
      session.sink._writeln(
        `${JSON.stringify({ _e: 'metro:done', _t: Date.now() })}\n`
      );
      await new Promise<void>(resolve => session.sink.end(() => resolve()));
      await runExportCli([String(process.pid), '-o', output]);
      const parsed = JSON.parse(await fs.readFile(output, 'utf8'));
      expect(JSON.stringify(parsed)).toContain('metro');
    } finally {
      session.destroy();
      restoreDir();
      restoreIpc();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('filters exported events by repeated and comma-separated patterns', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-export-'));
    const input = path.join(dir, 'events.jsonl');
    const output = path.join(dir, 'trace.json');
    await fs.writeFile(
      input,
      [
        JSON.stringify({ _e: 'metro:done', _t: 900 }),
        JSON.stringify({ _e: 'env:info', _t: 1000 }),
        JSON.stringify({ _e: 'server:error', _t: 1100 }),
      ].join('\n') + '\n'
    );

    try {
      await runExportCli([
        '--input',
        input,
        '--filter',
        'metro:*',
        '--filter',
        'env:info,server:test*',
        '-o',
        output,
      ]);
      const serialized = JSON.stringify(
        JSON.parse(await fs.readFile(output, 'utf8'))
      );
      expect(serialized).toContain('metro');
      expect(serialized).toContain('env');
      expect(serialized).not.toContain('server');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('filters exported events to spans with --spans', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-export-'));
    const input = path.join(dir, 'events.jsonl');
    const output = path.join(dir, 'trace.json');
    await fs.writeFile(
      input,
      [
        JSON.stringify({ _e: 'metro:progress', _t: 900 }),
        JSON.stringify({ _e: 'metro:done', _t: 1000, _d: 75 }),
      ].join('\n') + '\n'
    );

    try {
      await runExportCli(['--input', input, '--spans', '-o', output]);
      const trace = JSON.parse(await fs.readFile(output, 'utf8'));
      expect(trace.traceEvents).toContainEqual(
        expect.objectContaining({ ph: 'X', name: 'done' })
      );
      expect(trace.traceEvents).not.toContainEqual(
        expect.objectContaining({ ph: 'i', name: 'progress' })
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('excludes debug events unless --debug is passed', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-export-'));
    const input = path.join(dir, 'events.jsonl');
    const output = path.join(dir, 'trace.json');
    await fs.writeFile(
      input,
      [
        JSON.stringify({ _e: 'metro:done', _t: 1000, _d: 75 }),
        JSON.stringify({ _e: 'metro:probe', _t: 1100, _l: 1 }),
      ].join('\n') + '\n'
    );

    try {
      await runExportCli(['--input', input, '-o', output]);
      const serialized = await fs.readFile(output, 'utf8');
      expect(serialized).toContain('done');
      expect(serialized).not.toContain('probe');

      await runExportCli(['--input', input, '--debug', '-o', output]);
      expect(await fs.readFile(output, 'utf8')).toContain('probe');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('bounds explicit tail export with --timeout', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-export-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const output = path.join(dir, 'trace.json');
    const session = createSession({ command: 'export' });

    try {
      session.sink._writeln(
        `${JSON.stringify({ _e: 'metro:tail', _t: Date.now() })}\n`
      );
      await waitForFile(path.join(session.sessionDir, '0.jsonl'), 'metro:tail');
      await runExportCli([
        String(process.pid),
        '--tail',
        '--timeout',
        '5ms',
        '-o',
        output,
      ]);
      const parsed = JSON.parse(await fs.readFile(output, 'utf8'));
      expect(JSON.stringify(parsed)).toContain('metro');
    } finally {
      session.destroy();
      restoreDir();
      restoreIpc();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects --timeout without --tail', async () => {
    await expect(runExportCli(['--timeout', '1s'])).rejects.toThrow(
      'Use --timeout only with --tail'
    );
  });
});

function setEnv(name: string, value: string | undefined) {
  const previous = process.env[name];
  if (value == null) delete process.env[name];
  else process.env[name] = value;
  return () => {
    if (previous == null) delete process.env[name];
    else process.env[name] = previous;
  };
}

function setSessionDir(dir: string) {
  _setSessionBaseDir(dir);
  return () => _setSessionBaseDir(undefined);
}

async function waitForFile(file: string, value: string) {
  for (let i = 0; i < 20; i++) {
    try {
      if ((await fs.readFile(file, 'utf8')).includes(value)) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${value}`);
}
