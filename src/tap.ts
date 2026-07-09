import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { createInterface } from 'node:readline';

import { DEFAULT_SEGMENTS, SESSION_FILES } from './constants';
import {
  cleanStaleSessionsSync,
  getSessionBaseDir,
  isPidAlive,
  newestSessionIds,
  readMetaSync,
} from './clean';
import { type SessionMeta } from './session';
import type { ParsedEvent } from './types';
import {
  compileEventFilter,
  parseEventLine,
  parseSince,
  type EventFilterOptions,
} from './utils/eventFilter';
import { resolveSocketPath } from './utils/sessionSockets';

export interface ListedSession {
  id: string;
  pid: number;
  formatVersion: number;
  alive: boolean;
  startedAt: number;
  command: string;
  cwd: string;
  version?: string;
  origin?: SessionMeta['origin'];
  sessionDir: string;
}

export interface ListSessionsOptions {
  selector?: string;
}

export interface TapOptions extends EventFilterOptions {
  follow?: boolean;
  signal?: AbortSignal;
  timeout?: number;
  idleTimeout?: number;
}

export async function listSessions(
  options: ListSessionsOptions = {}
): Promise<ListedSession[]> {
  cleanStaleSessionsSync();
  const baseDir = getSessionBaseDir();
  const entries = await fs
    .readdir(baseDir, { withFileTypes: true })
    .catch(() => []);
  const sessions: ListedSession[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionDir = path.join(baseDir, entry.name);
    const meta = readMetaSync(sessionDir);
    if (!meta) continue;
    sessions.push({
      id: entry.name,
      pid: meta.pid,
      formatVersion: meta.formatVersion,
      alive: false,
      startedAt: meta.startedAt,
      command: meta.command,
      cwd: meta.cwd,
      version: meta.version,
      origin: meta.origin,
      sessionDir,
    });
  }

  const newest = newestSessionIds(sessions);
  for (const session of sessions) {
    session.alive = isPidAlive(session.pid) && newest.has(session.id);
  }

  return filterSessions(sessions, options.selector).sort(
    (a, b) => b.startedAt - a.startedAt
  );
}

export async function resolveSession(selector?: string) {
  const sessions = await listSessions({ selector });
  const activeSessions = sessions.filter(session => session.alive);
  const session =
    sessions.length === 1
      ? sessions[0]
      : activeSessions.length === 1
        ? activeSessions[0]
        : null;
  if (!session)
    throw new Error(
      selector != null
        ? sessions.length
          ? `Ambiguous 2g session "${selector}"; specify one of: ${sessions
              .map(formatSessionSelector)
              .join(', ')}`
          : `No 2g session matching "${selector}"`
        : sessions.length
          ? `Ambiguous 2g session; specify one of: ${sessions
              .map(formatSessionSelector)
              .join(', ')}`
          : 'No 2g sessions found'
    );
  return session;
}

export async function* tap(
  sessionDir: string,
  options: TapOptions = {}
): AsyncIterable<ParsedEvent> {
  const follow = options.follow === true;
  const since = parseSince(options.since);
  const eventFilter = compileEventFilter(options.filter);
  const abort = createTapAbortController(options, follow);
  const signal = abort?.signal ?? options.signal;
  const meta = readMetaSync(sessionDir);
  const live = follow ? await connectLive(sessionDir, meta, signal) : undefined;
  const history = await openHistoryFiles(sessionDir, meta);
  let idleTimer: NodeJS.Timeout | undefined;

  try {
    for (const handle of history) {
      for await (const line of readLines(handle)) {
        const event = parseEventLine(line, options, eventFilter, since);
        if (event) yield event;
      }
    }
  } finally {
    await Promise.all(history.map(handle => handle.close().catch(() => {})));
  }

  if (!live) return;
  if (options.idleTimeout != null && abort) {
    idleTimer = setAbortTimer(abort, options.idleTimeout);
  }

  for (const line of live.buffer.splice(0)) {
    const event = parseEventLine(line, options, eventFilter, since);
    if (event) {
      if (idleTimer)
        idleTimer = resetAbortTimer(idleTimer, abort!, options.idleTimeout!);
      yield event;
    }
  }

  while (!signal?.aborted) {
    const line = await readLiveLine(live, signal);
    if (line == null) break;
    if (idleTimer)
      idleTimer = resetAbortTimer(idleTimer, abort!, options.idleTimeout!);
    const event = parseEventLine(line, options, eventFilter, since);
    if (event) yield event;
  }

  if (idleTimer) clearTimeout(idleTimer);
}

// Rotation discards the oldest segment once the ring fills, so a retained
// window whose oldest event is not the session's start has lost earlier events.
export async function detectRotationLoss(sessionDir: string): Promise<boolean> {
  const meta = readMetaSync(sessionDir);
  const maxSegments = meta?.maxSegments ?? DEFAULT_SEGMENTS;
  // The oldest retained segment is the highest-numbered file still present
  for (let index = maxSegments - 1; index >= 0; index--) {
    const handle = await fs
      .open(path.join(sessionDir, `${index}.jsonl`), 'r')
      .catch(() => null);
    if (!handle) continue;
    try {
      const first = await readFirstLine(handle);
      // An empty window has lost nothing; otherwise loss iff it skips the start
      return first != null && !isSessionStartLine(first);
    } finally {
      await handle.close().catch(() => {});
    }
  }
  return false;
}

async function readFirstLine(handle: fs.FileHandle) {
  for await (const line of readLines(handle)) return line;
  return null;
}

function isSessionStartLine(line: string) {
  // Every session opens with a root:init event (see installEventLogger)
  return line.startsWith('{"_e":"root:init"');
}

async function openHistoryFiles(sessionDir: string, meta: SessionMeta | null) {
  const maxSegments = meta?.maxSegments ?? DEFAULT_SEGMENTS;
  const handles = await Promise.all(
    Array.from({ length: maxSegments }, (_, index) =>
      fs.open(path.join(sessionDir, `${index}.jsonl`), 'r').catch(() => null)
    )
  );
  return handles.filter(handle => handle != null).reverse();
}

async function* readLines(handle: fs.FileHandle) {
  let pending = '';
  for await (const chunk of handle.createReadStream({ encoding: 'utf8' })) {
    pending += chunk;
    let index = -1;
    while ((index = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, index);
      pending = pending.slice(index + 1);
      if (line) yield line;
    }
  }
  if (pending) yield pending;
}

function filterSessions(
  sessions: ListedSession[],
  selector: string | undefined
) {
  const input = selector?.trim();
  if (!input) return sessions;

  const exact = sessions.filter(session =>
    matchesSessionExactly(session, input)
  );
  if (exact.length) return exact;

  const normalized = input.toLowerCase();
  return sessions.filter(session =>
    sessionSearchValues(session).some(value =>
      value.toLowerCase().includes(normalized)
    )
  );
}

function formatSessionSelector(session: ListedSession) {
  return `${session.pid} (${session.command})`;
}

async function connectLive(
  sessionDir: string,
  meta: SessionMeta | null,
  signal?: AbortSignal
) {
  const socketPath = resolveSocketPath(
    sessionDir,
    meta?.socket ?? SESSION_FILES.liveSocket
  );
  const socket = await connectWithRetry(socketPath, signal);
  if (!socket) return undefined;
  const rl = createInterface({ input: socket });
  const buffer: string[] = [];
  const waiters: Array<(line: string | null) => void> = [];
  let closed = false;

  const push = (line: string | null) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else if (line != null) buffer.push(line);
  };

  rl.on('line', line => push(line));
  rl.on('close', () => {
    closed = true;
    push(null);
  });
  socket.on('error', () => {
    closed = true;
    push(null);
  });
  signal?.addEventListener('abort', () => socket.destroy(), { once: true });

  return {
    buffer,
    next() {
      if (buffer.length) return Promise.resolve(buffer.shift()!);
      if (closed) return Promise.resolve(null);
      return new Promise<string | null>(resolve => waiters.push(resolve));
    },
  };
}

function readLiveLine(
  live: { next(): Promise<string | null> },
  signal?: AbortSignal
) {
  if (!signal) return live.next();
  if (signal.aborted) return Promise.resolve(null);

  return new Promise<string | null>(resolve => {
    const onAbort = () => resolve(null);
    signal.addEventListener('abort', onAbort, { once: true });
    live.next().then(line => {
      signal.removeEventListener('abort', onAbort);
      resolve(signal.aborted ? null : line);
    });
  });
}

function createTapAbortController(options: TapOptions, follow: boolean) {
  if (!follow || (options.timeout == null && options.idleTimeout == null))
    return undefined;

  const abort = new AbortController();
  options.signal?.addEventListener('abort', () => abort.abort(), {
    once: true,
  });
  if (options.timeout != null) setAbortTimer(abort, options.timeout);
  return abort;
}

function resetAbortTimer(
  timer: NodeJS.Timeout,
  abort: AbortController,
  timeout: number
) {
  clearTimeout(timer);
  return setAbortTimer(abort, timeout);
}

function setAbortTimer(abort: AbortController, timeout: number) {
  const timer = setTimeout(() => abort.abort(), timeout);
  timer.unref?.();
  return timer;
}

function matchesSessionExactly(session: ListedSession, selector: string) {
  return sessionSearchValues(session).some(value => value === selector);
}

function sessionSearchValues(session: ListedSession) {
  return [
    session.id,
    String(session.pid),
    session.sessionDir,
    session.cwd,
    session.command,
    session.origin?.cwd,
    session.origin?.argv.join(' '),
    session.origin?.execPath,
    session.origin?.env?.npmLifecycleEvent,
    session.origin?.env?.npmPackageName,
  ].filter((value): value is string => !!value);
}

async function connectWithRetry(socketPath: string, signal?: AbortSignal) {
  for (let attempt = 0; attempt < 20 && !signal?.aborted; attempt++) {
    const socket = await tryConnect(socketPath, signal);
    if (socket) return socket;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return null;
}

function tryConnect(socketPath: string, signal?: AbortSignal) {
  return new Promise<net.Socket | null>(resolve => {
    const socket = net.connect(socketPath);
    const cleanup = () => {
      socket.off('connect', onConnect);
      socket.off('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onConnect = () => {
      cleanup();
      resolve(socket);
    };
    const onError = () => {
      cleanup();
      socket.destroy();
      resolve(null);
    };
    const onAbort = () => {
      cleanup();
      socket.destroy();
      resolve(null);
    };
    socket.once('connect', onConnect);
    socket.once('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
