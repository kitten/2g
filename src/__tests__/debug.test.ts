import { describe, expect, it, vi } from 'vitest';

import { createDebugSink } from '../debug';

describe('debug sink', () => {
  it('filters a block of normal, debug, and malformed events', () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const sink = createDebugSink('metro:*, env');
    try {
      sink!._writeln(
        [
          '',
          'invalid json',
          '{"_e":"metro:progress","_t":1000}',
          '{"_e":"metro:probe","_t":1000,"_l":1}',
          '{"_e":"env:mode","_t":1000}',
          '{"_e":"other:noise","_t":1000}',
          '{"_e":"other:probe","_t":1000,"_l":1}',
          '',
        ].join('\n')
      );
      expect(write).toHaveBeenCalledTimes(3);
      const output = write.mock.calls.map(call => String(call[0])).join('');
      expect(output).toContain('metro:progress');
      expect(output).toContain('metro:probe');
      expect(output).toContain('env:mode');
      expect(output).not.toContain('other:');
    } finally {
      write.mockRestore();
    }
  });

  it('prints debug-level events without opt-in', () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const sink = createDebugSink('metro:*');

    try {
      sink!._writeln(
        `${JSON.stringify({
          _e: 'metro:probe',
          _t: Date.now(),
          _l: 1,
          file: 'App.tsx',
        })}\n`
      );
      const output = write.mock.calls.map(call => String(call[0])).join('');
      expect(output).toContain('metro:probe');
      expect(output).toContain('"file":"App.tsx"');
    } finally {
      write.mockRestore();
    }
  });
});
