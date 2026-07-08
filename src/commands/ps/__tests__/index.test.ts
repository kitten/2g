import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { EVENT_LOG_FORMAT_VERSION, SESSION_FILES } from '../../../constants';
import { _setSessionBaseDir } from '../../../clean';
import { runPsCli } from '../index';

describe('ps command', () => {
  it('prints sessions as JSON with --json', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-ps-'));
    const restoreDir = setSessionDir(dir);
    await writeMeta(path.join(dir, String(process.pid)));
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      await runPsCli(['--json']);
      const sessions = JSON.parse(String(write.mock.calls[0][0]));
      expect(sessions[0]).toMatchObject({
        pid: process.pid,
        command: 'test command',
        alive: true,
        sessionDir: path.join(dir, String(process.pid)),
      });
    } finally {
      write.mockRestore();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('filters sessions by selector', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-ps-'));
    const restoreDir = setSessionDir(dir);
    await writeMeta(path.join(dir, '100'), 100, 'expo start -p web');
    await writeMeta(path.join(dir, '200'), 200, 'expo export');
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      await runPsCli(['start', '--json']);
      const sessions = JSON.parse(String(write.mock.calls[0][0]));
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        pid: 100,
        command: 'expo start -p web',
      });
    } finally {
      write.mockRestore();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('filters sessions to active processes with --active', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-ps-'));
    const restoreDir = setSessionDir(dir);
    await writeMeta(path.join(dir, String(process.pid)), process.pid, 'active');
    await writeMeta(path.join(dir, '999999'), 999999, 'exited');
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      await runPsCli(['--active', '--json']);
      const sessions = JSON.parse(String(write.mock.calls[0][0]));
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        pid: process.pid,
        command: 'active',
        alive: true,
      });
    } finally {
      write.mockRestore();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('accepts -a as the active sessions shorthand', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-ps-'));
    const restoreDir = setSessionDir(dir);
    await writeMeta(path.join(dir, String(process.pid)), process.pid, 'active');
    await writeMeta(path.join(dir, '999999'), 999999, 'exited');
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      await runPsCli(['-a']);
      const output = write.mock.calls.map(call => String(call[0])).join('');
      expect(output).toContain('active');
      expect(output).not.toContain('exited');
    } finally {
      write.mockRestore();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('escapes TSV output fields', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-ps-'));
    const restoreDir = setSessionDir(dir);
    await writeMeta(path.join(dir, '300'), 300, 'expo\tstart\nweb');
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      await runPsCli(['300']);
      expect(String(write.mock.calls[1][0])).toContain('expo\\tstart\\nweb');
    } finally {
      write.mockRestore();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

async function writeMeta(
  sessionDir: string,
  pid = process.pid,
  command = 'test command'
) {
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionDir, SESSION_FILES.meta),
    JSON.stringify({
      pid,
      formatVersion: EVENT_LOG_FORMAT_VERSION,
      startedAt: Date.now(),
      command,
      cwd: process.cwd(),
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

function setSessionDir(dir: string) {
  _setSessionBaseDir(dir);
  return () => _setSessionBaseDir(undefined);
}
