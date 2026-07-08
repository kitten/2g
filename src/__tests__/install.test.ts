import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_RETAIN_MS,
  EVENT_LOG_FORMAT_VERSION,
  EVENT_LOG_TMP_DIR,
  INTERNAL_IPC_ENV,
  LOG_DEBUG_ENV,
  SESSION_FILES,
} from '../constants';
import { _setSessionBaseDir, getSessionBaseDir } from '../clean';
import { createSession } from '../session';

describe('install session', () => {
  it('creates session metadata before sockets are ready and forwards worker lines', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const session = createSession({
      command: 'test command',
      version: '1.2.3',
    });

    try {
      const meta = JSON.parse(
        await fs.readFile(
          path.join(session.sessionDir, SESSION_FILES.meta),
          'utf8'
        )
      );
      const pipeName = expect.stringMatching(/^\\\\\.\\pipe\\event-log-/);
      expect(meta).toMatchObject({
        command: 'test command',
        cwd: process.cwd(),
        formatVersion: EVENT_LOG_FORMAT_VERSION,
        maxSegments: 3,
        version: '1.2.3',
        socket:
          process.platform === 'win32' ? pipeName : SESSION_FILES.liveSocket,
        ipcSocket:
          process.platform === 'win32' ? pipeName : SESSION_FILES.ipcSocket,
        origin: {
          argv: process.argv.slice(1),
          execPath: process.execPath,
          cwd: process.cwd(),
        },
      });

      session.sink._writeln(
        `${JSON.stringify({ _e: 'test:history', _t: Date.now() })}\n`
      );
      await new Promise<void>(resolve => session.sink.end(() => resolve()));
      expect(
        await fs.readFile(path.join(session.sessionDir, '0.jsonl'), 'utf8')
      ).toContain('"test:history"');
    } finally {
      session.destroy();
      await fs.rm(dir, { recursive: true, force: true });
      restoreDir();
      restoreIpc();
    }
  });

  it.skipIf(process.platform === 'win32')(
    'creates private session files on POSIX',
    async () => {
      const dir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'event-log-session-')
      );
      const baseDir = path.join(dir, 'sessions');
      await fs.mkdir(baseDir, { mode: 0o755 });
      const restoreDir = setSessionDir(baseDir);
      const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
      const session = createSession({ command: 'private' });

      try {
        session.sink._writeln(
          `${JSON.stringify({ _e: 'test:private', _t: Date.now() })}\n`
        );
        await new Promise<Error | null | undefined>(resolve =>
          session.sink.flush!(resolve)
        );

        expect((await fs.stat(session.sessionDir)).mode & 0o777).toBe(0o700);
        expect(
          (await fs.stat(path.join(session.sessionDir, SESSION_FILES.meta)))
            .mode & 0o777
        ).toBe(0o600);
        expect(
          (await fs.stat(path.join(session.sessionDir, '0.jsonl'))).mode & 0o777
        ).toBe(0o600);
      } finally {
        session.destroy();
        restoreDir();
        restoreIpc();
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  );

  it('creates collision-free session dirs that preserve prior sessions', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const first = createSession({ command: 'one' });

    try {
      first.sink._writeln(
        `${JSON.stringify({ _e: 'test:one', _t: Date.now() })}\n`
      );
      await new Promise<void>(resolve => first.sink.end(() => resolve()));

      const second = createSession({ command: 'two' });
      try {
        expect(path.basename(first.sessionDir)).toMatch(
          /^\d+-[0-9a-z]+-[0-9a-z]{6}$/
        );
        expect(second.sessionDir).not.toBe(first.sessionDir);
        expect(
          await fs.readFile(path.join(first.sessionDir, '0.jsonl'), 'utf8')
        ).toContain('"test:one"');
      } finally {
        second.destroy();
      }
    } finally {
      first.destroy();
      restoreDir();
      restoreIpc();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('flushes the session file stream through the composite sink', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const session = createSession({ command: 'flush' });

    try {
      session.sink._writeln(
        `${JSON.stringify({ _e: 'test:flush', _t: Date.now() })}\n`
      );
      await new Promise<Error | null | undefined>(resolve =>
        session.sink.flush!(resolve)
      );
      expect(
        await fs.readFile(path.join(session.sessionDir, '0.jsonl'), 'utf8')
      ).toContain('"test:flush"');
    } finally {
      session.destroy();
      restoreDir();
      restoreIpc();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('defers stale session cleanup off the install path', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const staleDir = path.join(dir, '9999999');
    await fs.mkdir(staleDir, { recursive: true });
    await fs.writeFile(
      path.join(staleDir, SESSION_FILES.meta),
      JSON.stringify({
        pid: 9_999_999,
        formatVersion: EVENT_LOG_FORMAT_VERSION,
        startedAt: Date.now() - DEFAULT_RETAIN_MS - 1_000,
        command: 'stale',
        cwd: process.cwd(),
        maxSegments: 3,
        socket: SESSION_FILES.liveSocket,
        ipcSocket: SESSION_FILES.ipcSocket,
      })
    );
    const session = createSession({ command: 'fresh' });

    try {
      expect(await exists(staleDir)).toBe(true);
      await waitFor(async () => !(await exists(staleDir)));
    } finally {
      session.destroy();
      restoreIpc();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('uses a system tmpdir parent by default', () => {
    const restoreDir = setSessionDir(undefined);
    try {
      expect(getSessionBaseDir()).toBe(EVENT_LOG_TMP_DIR);
    } finally {
      restoreDir();
    }
  });

  it('ignores incompatible session metadata', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const sessionDir = path.join(dir, '123');
    const restoreDir = setSessionDir(dir);
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionDir, SESSION_FILES.meta),
      JSON.stringify({
        pid: 123,
        formatVersion: EVENT_LOG_FORMAT_VERSION + 1,
        startedAt: Date.now(),
        command: 'old',
        cwd: process.cwd(),
        socket: SESSION_FILES.liveSocket,
        ipcSocket: SESSION_FILES.ipcSocket,
      })
    );

    try {
      const { readMetaSync } = await import('../clean');
      expect(readMetaSync(sessionDir)).toBeNull();
    } finally {
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('prints matching LOG_DEBUG events through the parent session sink', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreDebug = setEnv(LOG_DEBUG_ENV, 'metro:*');
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const session = createSession({ command: 'debug' });

    try {
      session.sink._writeln(
        `${JSON.stringify({ _e: 'metro:done', _t: Date.now(), _d: 1534 })}\n`
      );
      session.sink._writeln(
        `${JSON.stringify({ _e: 'env:info', _t: Date.now() })}\n`
      );
      session.sink._writeln(
        `${JSON.stringify({
          _e: 'metro:worker',
          _t: Date.now(),
          _w: 'worker_thread:1',
          file: 'App.tsx',
        })}\n`
      );

      const output = write.mock.calls.map(call => String(call[0])).join('');
      expect(output).toMatch(
        /\d{4}-\d{2}-\d{2}T.* metro:done 1\.53s \{"_e":"metro:done"/
      );
      expect(output).toContain('metro:worker {"_e":"metro:worker"');
      expect(output).toContain('"_w":"worker_thread:1"');
      expect(output).toContain('"file":"App.tsx"');
      expect(output).not.toContain('env:info');
    } finally {
      write.mockRestore();
      session.destroy();
      restoreDebug();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
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

function setSessionDir(dir: string | undefined) {
  _setSessionBaseDir(dir);
  return () => _setSessionBaseDir(undefined);
}

async function exists(file: string) {
  try {
    await fs.stat(file);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 40; i++) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for condition');
}
