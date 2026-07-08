import { LOG_DEBUG_ENV } from './constants';
import {
  compileEventFilter,
  matchesTapOptions,
  parseEventLine,
} from './utils/eventFilter';
import type { EventSink } from './utils/logStream';
import { formatPrettyEvent, shouldColorizeStream } from './utils/pretty';

export function createDebugSink(
  value = process.env[LOG_DEBUG_ENV]
): EventSink | null {
  const filter = compileLogDebugFilter(value);
  if (!filter) return null;

  const colorize = shouldColorizeStream(process.stderr);
  return {
    get writable() {
      return true;
    },
    _writeln(data: string) {
      // Ingested worker blocks can carry multiple lines per write
      let start = 0;
      let end: number;
      while ((end = data.indexOf('\n', start)) !== -1) {
        const line = data.slice(start, end);
        start = end + 1;
        if (!line) continue;
        // LOG_DEBUG is itself the debug opt-in
        const event = parseEventLine(line, { debug: true });
        if (!event || !matchesTapOptions(event, { debug: true }, filter))
          continue;
        process.stderr.write(
          `${formatPrettyEvent(event, {
            colorize,
            stream: process.stderr,
          })}\n`
        );
      }
      return true;
    },
    end(cb?: () => void) {
      cb?.();
      return this;
    },
    destroy() {},
  };
}

function compileLogDebugFilter(value: string | undefined) {
  const patterns = value
    ?.split(/[\s,]+/)
    .map(pattern => pattern.trim())
    .filter(Boolean);
  if (!patterns?.length) return null;
  return compileEventFilter(patterns);
}
