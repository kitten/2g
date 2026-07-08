import os from 'node:os';
import path from 'node:path';

// The POSIX tmpdir is shared across users; Windows %TEMP% is per-user
const uid = process.getuid?.();
export const EVENT_LOG_TMP_DIR = path.join(
  os.tmpdir(),
  uid == null ? 'event-log' : `event-log-${uid}`
);
export const EVENT_LOG_FORMAT_VERSION = 1;
export const EVENT_LEVEL_DEBUG = 1;
export const EVENT_LOG_STATE_VERSION = 1;
export const LOG_DEBUG_ENV = 'LOG_DEBUG';
export const LOG_EVENTS_ENV = 'LOG_EVENTS';
export const INTERNAL_IPC_ENV = '__eventLogIpc';
export const INTERNAL_PROCESS_ORIGIN_ENV = '__eventLogProcessOrigin';

export const SESSION_FILES = {
  meta: 'meta.json',
  liveSocket: 'live.sock',
  ipcSocket: 'ipc.sock',
} as const;

export const DEFAULT_SEGMENTS = 3;
export const DEFAULT_SEGMENT_SIZE = 512 * 1024;
export const DEFAULT_RETAIN_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_MAX_SESSIONS = 100;
