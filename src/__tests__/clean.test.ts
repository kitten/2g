import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  _setSessionBaseDir,
  cleanExitedSessionsSync,
  cleanStaleSessionsSync,
  readMetaSync,
} from '../clean';
import { resolveSocketPath } from '../utils/sessionSockets';
import {
  DEFAULT_MAX_SESSIONS,
  DEFAULT_RETAIN_MS,
  EVENT_LOG_FORMAT_VERSION,
  SESSION_FILES,
} from '../constants';

describe('clean', () => {
  it('removes old dead sessions and keeps recent or alive sessions', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-clean-'));
    const restoreDir = setSessionDir(dir);
    const old = Date.now() - DEFAULT_RETAIN_MS - 1_000;
    const recent = Date.now();

    await writeMeta(path.join(dir, 'old-dead'), 9_999_999, old);
    await writeMeta(path.join(dir, 'recent-dead'), 9_999_998, recent);
    await writeMeta(path.join(dir, 'old-alive'), process.pid, old);

    try {
      expect(cleanStaleSessionsSync()).toBe(1);
      expect(await exists(path.join(dir, 'old-dead'))).toBe(false);
      expect(await exists(path.join(dir, 'recent-dead'))).toBe(true);
      expect(await exists(path.join(dir, 'old-alive'))).toBe(true);
    } finally {
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('trims excess dead sessions without deleting alive sessions', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-clean-'));
    const restoreDir = setSessionDir(dir);
    const startedAt = Date.now();

    for (let i = 0; i < DEFAULT_MAX_SESSIONS + 2; i++) {
      await writeMeta(
        path.join(dir, `dead-${i}`),
        9_999_000 + i,
        startedAt + i
      );
    }
    await writeMeta(path.join(dir, 'alive-0'), process.pid, startedAt - 1);

    try {
      expect(cleanStaleSessionsSync()).toBe(2);
      expect(await exists(path.join(dir, 'dead-0'))).toBe(false);
      expect(await exists(path.join(dir, 'dead-1'))).toBe(false);
      expect(await exists(path.join(dir, 'dead-2'))).toBe(true);
      expect(await exists(path.join(dir, 'alive-0'))).toBe(true);
    } finally {
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('treats only the newest session per pid as alive', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-clean-'));
    const restoreDir = setSessionDir(dir);
    const old = Date.now() - DEFAULT_RETAIN_MS - 1_000;

    await writeMeta(path.join(dir, 'gen-old'), process.pid, old);
    await writeMeta(path.join(dir, 'gen-new'), process.pid, Date.now());

    try {
      expect(cleanStaleSessionsSync()).toBe(1);
      expect(await exists(path.join(dir, 'gen-old'))).toBe(false);
      expect(await exists(path.join(dir, 'gen-new'))).toBe(true);
    } finally {
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('breaks newest-session timestamp ties by id', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-clean-'));
    const restoreDir = setSessionDir(dir);
    const startedAt = Date.now();

    await writeMeta(path.join(dir, 'tie-a'), process.pid, startedAt);
    await writeMeta(path.join(dir, 'tie-b'), process.pid, startedAt);

    try {
      expect(cleanExitedSessionsSync()).toBe(1);
      expect(await exists(path.join(dir, 'tie-a'))).toBe(false);
      expect(await exists(path.join(dir, 'tie-b'))).toBe(true);
    } finally {
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('resolves relative socket names against the session dir and pipe names verbatim', () => {
    const sessionDir = path.join(os.tmpdir(), 'session');
    expect(resolveSocketPath(sessionDir, 'live.sock')).toBe(
      path.join(sessionDir, 'live.sock')
    );
    expect(resolveSocketPath(sessionDir, '\\\\.\\pipe\\event-log-1-live')).toBe(
      '\\\\.\\pipe\\event-log-1-live'
    );
  });

  it('reads only compatible session metadata', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-clean-'));
    const sessionDir = path.join(dir, '123');
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionDir, SESSION_FILES.meta),
      JSON.stringify({
        pid: 123,
        formatVersion: EVENT_LOG_FORMAT_VERSION + 1,
        startedAt: Date.now(),
        command: 'old',
        cwd: process.cwd(),
        maxSegments: 3,
        socket: SESSION_FILES.liveSocket,
        ipcSocket: SESSION_FILES.ipcSocket,
      })
    );

    try {
      expect(readMetaSync(sessionDir)).toBeNull();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

function setSessionDir(dir: string) {
  _setSessionBaseDir(dir);
  return () => _setSessionBaseDir(undefined);
}

async function writeMeta(sessionDir: string, pid: number, startedAt: number) {
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionDir, SESSION_FILES.meta),
    JSON.stringify({
      pid,
      formatVersion: EVENT_LOG_FORMAT_VERSION,
      startedAt,
      command: `command-${pid}`,
      cwd: process.cwd(),
      maxSegments: 3,
      socket: SESSION_FILES.liveSocket,
      ipcSocket: SESSION_FILES.ipcSocket,
      origin: {
        argv: process.argv.slice(1),
        execPath: process.execPath,
        cwd: process.cwd(),
      },
    })
  );
}

async function exists(file: string) {
  try {
    await fs.stat(file);
    return true;
  } catch {
    return false;
  }
}
