import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { runRecordCli } from '../index';

describe('record command', () => {
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
