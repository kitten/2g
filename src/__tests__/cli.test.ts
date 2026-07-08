import { describe, expect, it, vi } from 'vitest';

import { main } from '../cli';

describe('cli', () => {
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
      await expect(main(['unknown'])).rejects.toThrow(
        'Unknown command: unknown'
      );
    } finally {
      write.mockRestore();
    }
  });
});
