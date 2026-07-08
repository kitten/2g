import { describe, expect, it, vi } from 'vitest';

import { createDebugSink } from '../debug';

describe('debug sink', () => {
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
