import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { main } from '../cli';

describe('cli', () => {
  it.skipIf(process.platform === 'win32').each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGKILL', 137],
  ] as const)(
    'returns a failure for a child terminated by %s (status %i) after writing its trace',
    async (signal, exitCode) => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-cli-'));
      const output = path.join(dir, 'trace.json');
      const previousExitCode = process.exitCode;
      const script =
        'require("node:fs").writeSync(3,JSON.stringify({_e:"build:bundle",_t:1,_d:42})+"\\n");' +
        `process.kill(process.pid, ${JSON.stringify(signal)});`;

      try {
        await expect(
          main(['record', '-o', output, '--', process.execPath, '-e', script])
        ).resolves.toBe(exitCode);
        const trace = JSON.parse(await fs.readFile(output, 'utf8'));
        expect(JSON.stringify(trace)).toContain('build:bundle');
        expect(process.exitCode).toBe(previousExitCode);
      } finally {
        process.exitCode = previousExitCode;
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  );

  it.each([0, 7, 255])(
    'returns the recorded child exit code %i after writing its trace',
    async exitCode => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-cli-'));
      const output = path.join(dir, 'trace.json');
      const previousExitCode = process.exitCode;
      const script =
        'require("node:fs").writeSync(3,JSON.stringify({_e:"build:bundle",_t:1,_d:42})+"\\n");' +
        `process.exitCode=${exitCode};`;

      try {
        await expect(
          main(['record', '-o', output, '--', process.execPath, '-e', script])
        ).resolves.toBe(exitCode);
        const trace = JSON.parse(await fs.readFile(output, 'utf8'));
        expect(JSON.stringify(trace)).toContain('build:bundle');
        expect(process.exitCode).toBe(previousExitCode);
      } finally {
        process.exitCode = previousExitCode;
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  );

  it('prints help and rejects unknown commands', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      await expect(main(['--help'])).resolves.toBe(0);
      expect(write).toHaveBeenCalledWith(
        expect.stringContaining('Usage: 2g <command>')
      );
      expect(write).toHaveBeenCalledWith(
        expect.stringContaining('tap [selector]')
      );
      expect(write).toHaveBeenCalledWith(expect.stringContaining('typegen'));
      expect(write).not.toHaveBeenCalledWith(
        expect.stringContaining('extract')
      );
      expect(write).toHaveBeenCalledWith(
        expect.stringContaining('Run 2g <command> --help')
      );
      await expect(main(['tap', 'abc'])).rejects.toThrow(
        'No 2g session matching "abc"'
      );
      await expect(main(['ps', '--help'])).resolves.toBe(0);
      await expect(main(['record', '--help'])).resolves.toBe(0);
      await expect(main(['unknown'])).rejects.toThrow(
        'Unknown command: unknown'
      );
    } finally {
      write.mockRestore();
    }
  });
});
