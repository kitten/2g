import { EVENT_LOG_STATE_VERSION } from './constants';
import type { EventSink } from './utils/logStream';
import type { EventMeta } from './utils/serializeEvent';

export interface EventLoggerInfo {
  destination: 'file' | 'stdout' | 'stderr' | 'fd' | 'session' | 'ipc';
  isUserVisibleOutput: boolean;
  file?: string;
  fd?: number;
  sessionDir?: string;
}

export interface EventLogState {
  logPath: string;
  primarySink?: EventSink;
  eventMeta?: EventMeta;
  eventLoggerInfo: EventLoggerInfo | null;
  debug: boolean;
}

const STATE_SYMBOL = Symbol.for(`2g/state-${EVENT_LOG_STATE_VERSION}`);

interface EventLogGlobal {
  [STATE_SYMBOL]?: EventLogState;
}

export const eventLogState = getEventLogState();

export function _resetEventLogState() {
  eventLogState.primarySink?.destroy();
  eventLogState.logPath = process.cwd();
  eventLogState.primarySink = undefined;
  eventLogState.eventMeta = undefined;
  eventLogState.eventLoggerInfo = null;
  eventLogState.debug = false;
}

function getEventLogState() {
  const globalScope = globalThis as EventLogGlobal;
  return (globalScope[STATE_SYMBOL] ??= {
    logPath: process.cwd(),
    eventLoggerInfo: null,
    debug: false,
  });
}
