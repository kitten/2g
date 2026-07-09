import { installChildEventLogger } from './install';

export { events } from './events';

export {
  installEventLogger,
  installChildEventLogger,
  flushEventLogger,
  getEventLoggerInfo,
  type EventLoggerInfo,
  type InstallEventLoggerOptions,
} from './install';

export type {
  AllEvents,
  EventByKey,
  EventKeys,
  EventLogger,
  EventRegistry,
  ParsedEvent,
  Serialized,
  SerializedError,
  SpanEnd,
} from './types';

installChildEventLogger();
