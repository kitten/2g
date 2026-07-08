import path from 'node:path';

import { events } from './events';
import {
  EVENT_LOG_FORMAT_VERSION,
  LOG_DEBUG_ENV,
  LOG_EVENTS_ENV,
} from './constants';
import { eventLogState, type EventLoggerInfo } from './state';
import { createSession, type SessionOptions } from './session';
import {
  LogStream,
  type EventSink,
  type LogStreamOpener,
  type LogStreamOptions,
} from './utils/logStream';
import { getParentIpcPath, openIpc } from './utils/ipc';
import { getProcessOrigin, getProcessWorkerId } from './utils/processOrigin';
import { redirectConsoleForFd } from './utils/redirectConsole';

export type { EventLoggerInfo } from './state';

export interface InstallEventLoggerOptions extends SessionOptions {
  session?: boolean;
  debug?: boolean;
}

const rootEvent = events('root');

export function installEventLogger(
  targetOrOptions?: string | number | InstallEventLoggerOptions
): void {
  if (eventLogState.primarySink) return;

  const options =
    targetOrOptions && typeof targetOrOptions === 'object'
      ? targetOrOptions
      : undefined;

  const explicitTarget =
    parseLogTarget(process.env[LOG_EVENTS_ENV]) ??
    parseLogTarget(
      typeof targetOrOptions === 'string' || typeof targetOrOptions === 'number'
        ? targetOrOptions
        : undefined
    );

  if (explicitTarget != null) {
    if (typeof explicitTarget === 'number')
      redirectConsoleForFd(explicitTarget);
    eventLogState.debug = options?.debug ?? true;
    eventLogState.eventLoggerInfo = getExplicitTargetInfo(explicitTarget);
    activateSink(createPrimarySink(explicitTarget));
    return;
  }

  const ipcPath = getParentIpcPath();
  if (ipcPath) {
    eventLogState.debug = options?.debug ?? !!process.env[LOG_DEBUG_ENV];
    connectToParent(ipcPath);
    return;
  }

  if (options && options.session !== false) {
    eventLogState.debug = options.debug ?? !!process.env[LOG_DEBUG_ENV];
    const session = createSession(options);
    eventLogState.logPath = session.sessionDir;
    eventLogState.eventLoggerInfo = {
      destination: 'session',
      isUserVisibleOutput: false,
      sessionDir: session.sessionDir,
    };
    activateSink(session.sink, options.version);
    return;
  }
}

export const getEventLoggerInfo = (): EventLoggerInfo | null =>
  eventLogState.primarySink?.writable ? eventLogState.eventLoggerInfo : null;

export function flushEventLogger(): Promise<void> {
  return new Promise(resolve => {
    const sink = eventLogState.primarySink;
    if (sink?.flush) sink.flush(() => resolve());
    else resolve();
  });
}

function parseLogTarget(target: string | number | undefined) {
  if (typeof target === 'number') {
    return Number.isSafeInteger(target) && target > 0 ? target : undefined;
  }

  if (!target) return undefined;

  const fd = parseInt(target, 10);
  if (`${fd}` === target && fd > 0 && Number.isSafeInteger(fd)) return fd;

  try {
    const parsedPath = path.parse(target);
    const destination = path.format(parsedPath);
    eventLogState.logPath = parsedPath.dir || process.cwd();
    return destination;
  } catch {
    return undefined;
  }
}

function createPrimarySink(
  dest: string | number | LogStreamOpener,
  options?: LogStreamOptions
) {
  const stream = new LogStream(dest, options);
  // A dead target restores the no-op hot path
  stream.once('error', () => {
    eventLogState.primarySink = undefined;
    eventLogState.eventLoggerInfo = null;
  });
  return stream;
}

function getExplicitTargetInfo(target: string | number): EventLoggerInfo {
  if (typeof target === 'number') {
    return {
      destination: target === 1 ? 'stdout' : target === 2 ? 'stderr' : 'fd',
      isUserVisibleOutput: target === 1 || target === 2,
      fd: target,
    };
  }

  return {
    destination: 'file',
    isUserVisibleOutput: false,
    file: target,
  };
}

function getInitMetadata(version?: string) {
  return {
    format: 'v0-jsonl',
    formatVersion: EVENT_LOG_FORMAT_VERSION,
    version: version ?? 'UNVERSIONED',
    processOrigin: getProcessOrigin() ?? undefined,
  };
}

function activateSink(sink: EventSink, version?: string) {
  eventLogState.primarySink = sink;
  rootEvent('init', getInitMetadata(version));
}

function connectToParent(ipcPath: string) {
  const workerId = getProcessWorkerId();
  if (workerId) eventLogState.eventMeta = { _w: workerId };

  eventLogState.primarySink = createPrimarySink(openIpc(ipcPath), {
    closeFd: false,
  });
  eventLogState.eventLoggerInfo = {
    destination: 'ipc',
    isUserVisibleOutput: false,
  };
  rootEvent('init', getInitMetadata());
}
