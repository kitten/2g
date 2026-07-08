import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { EVENT_LOG_FORMAT_VERSION, SESSION_FILES } from '../../../constants';
import { _setSessionBaseDir } from '../../../clean';
import { runCleanCli } from '../index';

describe('clean command', () => {
  it('prints JSON with --json', async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'event-log-clean-cli-')
    );
    const restoreDir = setSessionDir(dir);
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      runCleanCli(['--json']);
      expect(JSON.parse(String(write.mock.calls[0][0]))).toEqual({
        removed: expect.any(Number),
      });
    } finally {
      write.mockRestore();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('removes all exited sessions with --all', async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'event-log-clean-cli-')
    );
    const restoreDir = setSessionDir(dir);
    const live = path.join(dir, String(process.pid));
    const exited = path.join(dir, '999999');
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      await writeMeta(live, process.pid);
      await writeMeta(exited, 999999);
      runCleanCli(['--all', '--json']);
      expect(JSON.parse(String(write.mock.calls[0][0]))).toEqual({
        removed: 1,
      });
      await expect(fs.stat(live)).resolves.toBeTruthy();
      await expect(fs.stat(exited)).rejects.toThrow();
    } finally {
      write.mockRestore();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('accepts -a as the all exited sessions shorthand', async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'event-log-clean-cli-')
    );
    const restoreDir = setSessionDir(dir);
    const exited = path.join(dir, '999999');
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      await writeMeta(exited, 999999);
      runCleanCli(['-a']);
      expect(String(write.mock.calls[0][0])).toBe(
        'Removed 1 exited sessions.\n'
      );
      await expect(fs.stat(exited)).rejects.toThrow();
    } finally {
      write.mockRestore();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

async function writeMeta(sessionDir: string, pid: number) {
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionDir, SESSION_FILES.meta),
    JSON.stringify({
      pid,
      formatVersion: EVENT_LOG_FORMAT_VERSION,
      startedAt: Date.now(),
      command: 'clean test',
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

function setSessionDir(dir: string) {
  _setSessionBaseDir(dir);
  return () => _setSessionBaseDir(undefined);
}
