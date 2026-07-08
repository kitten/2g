import { Console } from 'node:console';

import { describe, expect, it, vi } from 'vitest';

import { redirectConsoleToStderr } from '../redirectConsole';

describe('redirectConsole', () => {
  it('redirects console output to stderr', () => {
    const originalConsole = globalThis.console;
    const stdout = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    try {
      globalThis.console = new Console(process.stdout, process.stdout);
      redirectConsoleToStderr();
      console.log('json side log');
      expect(stdout).not.toHaveBeenCalled();
      expect(stderr.mock.calls[0][0]).toEqual(
        expect.stringContaining('json side log')
      );
    } finally {
      globalThis.console = originalConsole;
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });
});
