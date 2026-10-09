export { tap, type TapOptions } from './tap';

export {
  listSessions as list,
  resolveSession,
  type ListedSession,
  type ListSessionsOptions,
} from './sessions';

export {
  captureEvents,
  type CaptureOptions,
  type CaptureSpawnOptions,
  type EventCapture,
} from './capture';

export type {
  ParsedEvent,
  MetadataRegistry,
  EventLoggerMetadata,
} from './types';
