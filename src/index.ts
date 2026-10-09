import { installChildEventLogger } from './install';

export { events } from './events';

export {
  installEventLogger,
  installChildEventLogger,
  flushEventLogger,
  updateEventLoggerMetadata,
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
  MetadataRegistry,
  EventLoggerMetadata,
  ParsedEvent,
  Serialized,
  SerializedError,
  SpanEnd,
} from './types';

installChildEventLogger();
