import { describe, expect, it } from 'vitest';

import { parseSince } from '../../utils/eventFilter';

describe('shared command helpers', () => {
  it('parses common since formats in the tap layer', () => {
    const now = Date.now();
    expect(parseSince('1s')!).toBeLessThanOrEqual(now);
    expect(parseSince('2 minutes')!).toBeLessThanOrEqual(now);
    expect(parseSince('1m 30s')!).toBeLessThanOrEqual(now);
    expect(parseSince('1 hour, 5 min')!).toBeLessThanOrEqual(now);
    expect(parseSince('1700000000')).toBe(1_700_000_000_000);
    expect(parseSince('1700000000000')).toBe(1_700_000_000_000);
    expect(parseSince('2024-01-01T00:00:00.000Z')).toBe(1_704_067_200_000);
    expect(() => parseSince('10secx')).toThrow('Invalid since: 10secx');
  });
});
