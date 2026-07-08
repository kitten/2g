import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { INTERNAL_IPC_ENV } from '../../../constants';
import { _setSessionBaseDir } from '../../../clean';
import { createSession } from '../../../session';
import { runTapCli } from '../index';

describe('tap command', () => {
  it('replays history without following live events by default', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-tap-cli-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const session = createSession({ command: 'tap' });
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      session.sink._writeln(
        `${JSON.stringify({ _e: 'test:history', _t: Date.now() })}\n`
      );
      await new Promise<void>(resolve => session.sink.end(() => resolve()));
      await runTapCli([String(process.pid)]);
      expect(write).toHaveBeenCalledWith(
        expect.stringContaining('"test:history"')
      );
    } finally {
      write.mockRestore();
      session.destroy();
      restoreDir();
      restoreIpc();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('accepts repeatable and comma-separated filters', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-tap-cli-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const session = createSession({ command: 'tap' });
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      session.sink._writeln(
        `${JSON.stringify({ _e: 'metro:done', _t: Date.now() })}\n`
      );
      session.sink._writeln(
        `${JSON.stringify({ _e: 'env:info', _t: Date.now() })}\n`
      );
      await new Promise<void>(resolve => session.sink.end(() => resolve()));
      await runTapCli([
        String(process.pid),
        '--filter',
        'env:*',
        '--filter',
        'metro:test*,metro:done',
      ]);
      const output = write.mock.calls.map(call => String(call[0])).join('');
      expect(output).toContain('"metro:done"');
      expect(output).toContain('"env:info"');
    } finally {
      write.mockRestore();
      session.destroy();
      restoreDir();
      restoreIpc();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('filters output to spans with --spans', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-tap-cli-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const session = createSession({ command: 'tap' });
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      session.sink._writeln(
        `${JSON.stringify({ _e: 'metro:progress', _t: Date.now() })}\n`
      );
      session.sink._writeln(
        `${JSON.stringify({ _e: 'metro:done', _t: Date.now(), _d: 125.5 })}\n`
      );
      await new Promise<void>(resolve => session.sink.end(() => resolve()));
      await runTapCli([String(process.pid), '--spans']);
      const output = write.mock.calls.map(call => String(call[0])).join('');
      expect(output).toContain('"metro:done"');
      expect(output).not.toContain('"metro:progress"');
    } finally {
      write.mockRestore();
      session.destroy();
      restoreDir();
      restoreIpc();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('excludes debug events unless --debug is passed', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-tap-cli-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const session = createSession({ command: 'tap' });
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      session.sink._writeln(
        `${JSON.stringify({ _e: 'metro:done', _t: Date.now() })}\n`
      );
      session.sink._writeln(
        `${JSON.stringify({ _e: 'metro:probe', _t: Date.now(), _l: 1 })}\n`
      );
      await new Promise<void>(resolve => session.sink.end(() => resolve()));

      await runTapCli([String(process.pid)]);
      const output = write.mock.calls.map(call => String(call[0])).join('');
      expect(output).toContain('"metro:done"');
      expect(output).not.toContain('"metro:probe"');

      write.mockClear();
      await runTapCli([String(process.pid), '--debug']);
      const debugOutput = write.mock.calls
        .map(call => String(call[0]))
        .join('');
      expect(debugOutput).toContain('"metro:probe"');
    } finally {
      write.mockRestore();
      session.destroy();
      restoreDir();
      restoreIpc();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('prints readable span durations in pretty output', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-tap-cli-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const session = createSession({ command: 'tap' });
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      session.sink._writeln(
        `${JSON.stringify({ _e: 'metro:done', _t: Date.now(), _d: 1534 })}\n`
      );
      await new Promise<void>(resolve => session.sink.end(() => resolve()));
      await runTapCli([String(process.pid), '--format', 'pretty']);
      expect(String(write.mock.calls[0][0])).toMatch(/ metro:done 1\.53s \{/);
    } finally {
      write.mockRestore();
      session.destroy();
      restoreDir();
      restoreIpc();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('colorizes pretty event names when stdout is an interactive color TTY', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-tap-cli-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const restoreTty = setStdoutTty(true);
    const restoreColors = setStdoutHasColors(() => true);
    const session = createSession({ command: 'tap' });
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      session.sink._writeln(
        `${JSON.stringify({ _e: 'metro:started', _t: Date.now() })}\n`
      );
      session.sink._writeln(
        `${JSON.stringify({ _e: 'metro:done', _t: Date.now() })}\n`
      );
      await new Promise<void>(resolve => session.sink.end(() => resolve()));
      await runTapCli([String(process.pid), '--format', 'pretty']);
      const output = write.mock.calls.map(call => String(call[0])).join('');
      expect(output).toMatch(/\x1b\[2m\d{4}-\d{2}-\d{2}T/);
      const metroColors = [
        ...output.matchAll(/\x1b\[(\d+)mmetro:(?:started|done)\x1b\[39m/g),
      ].map(match => match[1]);
      expect(metroColors).toHaveLength(2);
      expect(new Set(metroColors).size).toBe(1);
    } finally {
      write.mockRestore();
      session.destroy();
      restoreColors();
      restoreTty();
      restoreDir();
      restoreIpc();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects conflicting JSON and pretty output options', async () => {
    await expect(runTapCli(['--json', '--format', 'pretty'])).rejects.toThrow(
      'Use either --json or --format pretty'
    );
  });

  it('keeps --json accepted but undocumented', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      await runTapCli(['--help']);
      expect(String(write.mock.calls[0][0])).not.toContain('--json');
    } finally {
      write.mockRestore();
    }
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

function setStdoutTty(value: boolean) {
  return setStdoutProperty('isTTY', value);
}

function setStdoutHasColors(value: () => boolean) {
  return setStdoutProperty('hasColors', value);
}

function setStdoutProperty(name: string, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdout, name);
  Object.defineProperty(process.stdout, name, {
    configurable: true,
    value,
  });
  return () => {
    if (descriptor) Object.defineProperty(process.stdout, name, descriptor);
    else delete (process.stdout as unknown as Record<string, unknown>)[name];
  };
}
