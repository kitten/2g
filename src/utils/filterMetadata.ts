import type { EventLoggerMetadata } from '../types';

export function filterMetadata(
  metadata: EventLoggerMetadata = {}
): EventLoggerMetadata {
  const ancestors: object[] = [];
  return JSON.parse(
    JSON.stringify(metadata, function (key, value) {
      if (
        (this === metadata && key.startsWith('_')) ||
        typeof value === 'bigint'
      )
        return;
      if (value && typeof value === 'object') {
        // Only ancestors are circular; shared objects in sibling fields are valid.
        while (ancestors.length && ancestors.at(-1) !== this) ancestors.pop();
        if (ancestors.includes(value)) return;
        ancestors.push(value);
      }
      return value;
    })
  );
}
