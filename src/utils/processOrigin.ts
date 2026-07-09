import { isMainThread, threadId } from 'node:worker_threads';

import { INTERNAL_PROCESS_ORIGIN_ENV } from '../constants';

const LOCAL_PROCESS_ORIGIN = Symbol.for('2g/process-origin');

interface EventLogGlobal {
  [LOCAL_PROCESS_ORIGIN]?: string;
}

export interface ProcessOrigin {
  kind: 'worker_thread' | 'event_log_child' | 'child_process';
  id: string;
}

export function setLocalProcessOrigin(id: string | undefined) {
  const globalScope = globalThis as EventLogGlobal;
  if (id) globalScope[LOCAL_PROCESS_ORIGIN] = id;
  else delete globalScope[LOCAL_PROCESS_ORIGIN];
}

export function getProcessOrigin(): ProcessOrigin | null {
  if (!isMainThread) {
    return { kind: 'worker_thread', id: String(threadId) };
  }

  const localOrigin = (globalThis as EventLogGlobal)[LOCAL_PROCESS_ORIGIN];
  const inheritedOrigin = process.env[INTERNAL_PROCESS_ORIGIN_ENV];
  if (inheritedOrigin && inheritedOrigin !== localOrigin) {
    return {
      kind: 'event_log_child',
      id: String(process.pid),
    };
  }

  if (process.env.NODE_UNIQUE_ID) {
    return { kind: 'child_process', id: process.env.NODE_UNIQUE_ID };
  }

  return null;
}

export function getProcessWorkerId() {
  const origin = getProcessOrigin();
  return origin ? `${origin.kind}:${origin.id}` : undefined;
}

export function publishProcessOrigin() {
  const origin = String(process.pid);
  process.env[INTERNAL_PROCESS_ORIGIN_ENV] = origin;
  setLocalProcessOrigin(origin);
  return () => {
    if (process.env[INTERNAL_PROCESS_ORIGIN_ENV] === origin)
      delete process.env[INTERNAL_PROCESS_ORIGIN_ENV];
    setLocalProcessOrigin(undefined);
  };
}
