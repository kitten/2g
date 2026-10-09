import path from 'node:path';

import type { EventLoggerMetadata } from './types';
import { events } from './events';
import { LOG_DEBUG_ENV, LOG_EVENTS_ENV } from './constants';
import { eventLogState, type EventLoggerInfo } from './state';
import { createSession, type SessionOptions } from './session';
import {
  LogStream,
  type EventSink,
  type LogStreamOpener,
  type LogStreamOptions,
} from './utils/logStream';
import {
  getParentIpcPath,
  isParentDebugEnabled,
  openIpc,
  publishTempIpcSink,
} from './utils/ipc';
import { getProcessWorkerId } from './utils/processOrigin';
import { redirectConsoleForFd } from './utils/redirectConsole';

export type { EventLoggerInfo } from './state';

export interface InstallEventLoggerOptions extends SessionOptions {
  session?: boolean;
  debug?: boolean;
}

const rootEvent = events('root');

export function installChildEventLogger(
  options?: InstallEventLoggerOptions
): boolean {
  if (eventLogState.primarySink) {
    return true;
  }

  setWorkerMetadata();
  return connectToParent(options);
}

function setWorkerMetadata() {
  const workerId = getProcessWorkerId();
  if (workerId) {
    eventLogState.eventMeta = { _w: workerId };
  }
}

export function installEventLogger(
  targetOrOptions?: string | number | InstallEventLoggerOptions
): void {
  if (eventLogState.primarySink) return;
  setWorkerMetadata();

  const options =
    targetOrOptions && typeof targetOrOptions === 'object'
      ? targetOrOptions
      : undefined;

  if (connectToParent(options)) {
    return;
  }

  const explicitTarget =
    parseLogTarget(process.env[LOG_EVENTS_ENV]) ??
    parseLogTarget(
      typeof targetOrOptions === 'string' || typeof targetOrOptions === 'number'
        ? targetOrOptions
        : undefined
    );

  if (explicitTarget != null) {
    let destination: string | number;
    if (typeof explicitTarget === 'number') {
      destination = explicitTarget;
      redirectConsoleForFd(destination);
    } else {
      destination = explicitTarget.file;
      eventLogState.logPath = explicitTarget.dir;
    }
    eventLogState.debug = options?.debug ?? true;
    eventLogState.eventLoggerInfo =
      typeof destination === 'number'
        ? {
            destination:
              destination === 1
                ? 'stdout'
                : destination === 2
                  ? 'stderr'
                  : 'fd',
            isUserVisibleOutput: destination === 1 || destination === 2,
            debug: eventLogState.debug,
            fd: destination,
          }
        : {
            destination: 'file',
            isUserVisibleOutput: false,
            debug: eventLogState.debug,
            file: destination,
          };
    const sink = createPrimarySink(destination);
    publishTempIpcSink(sink);
    activateSink(sink, options?.metadata);
    return;
  }

  if (options && options.session !== false) {
    eventLogState.debug = options.debug ?? !!process.env[LOG_DEBUG_ENV];
    const session = createSession(options);
    eventLogState.logPath = session.sessionDir;
    eventLogState.eventLoggerInfo = {
      destination: 'session',
      isUserVisibleOutput: false,
      debug: eventLogState.debug,
      sessionDir: session.sessionDir,
    };
    eventLogState.updateMetadata = session.updateMetadata;
    activateSink(session.sink, options.metadata);
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
    return {
      file: path.format(parsedPath),
      dir: parsedPath.dir || process.cwd(),
    };
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
    eventLogState.updateMetadata = undefined;
    eventLogState.eventLoggerInfo = null;
  });
  return stream;
}

export function updateEventLoggerMetadata(patch: EventLoggerMetadata): void {
  if (!eventLogState.primarySink?.writable) return;
  eventLogState.updateMetadata?.(patch);
  rootEvent('update', patch);
}

function activateSink(sink: EventSink, initialMetadata?: EventLoggerMetadata) {
  eventLogState.primarySink = sink;
  rootEvent('init', initialMetadata);
}

function connectToParent(options?: InstallEventLoggerOptions): boolean {
  const ipcPath = getParentIpcPath();
  if (!ipcPath) return false;

  eventLogState.debug =
    options?.debug ?? (isParentDebugEnabled() || !!process.env[LOG_DEBUG_ENV]);
  const sink = createPrimarySink(openIpc(ipcPath), { closeFd: false });
  eventLogState.eventLoggerInfo = {
    destination: 'ipc',
    isUserVisibleOutput: false,
    debug: eventLogState.debug,
  };
  activateSink(sink, options?.metadata);
  return true;
}
