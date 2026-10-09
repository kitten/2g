import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { createInterface } from 'node:readline';

import { DEFAULT_SEGMENTS, SESSION_FILES } from './constants';
import { readMetaSync } from './discovery';
import { type SessionMeta } from './session';
import type { ParsedEvent } from './types';
import {
  compileEventFilter,
  parseEventLine,
  parseSince,
  type EventFilterOptions,
} from './utils/eventFilter';
import { resolveSocketPath } from './utils/sessionSockets';
import { Queue } from './utils/queue';

export interface TapOptions extends EventFilterOptions {
  follow?: boolean;
  signal?: AbortSignal;
  timeout?: number;
  idleTimeout?: number;
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
  let idleTimer: NodeJS.Timeout | undefined;

  try {
    const live = follow
      ? await connectLive(sessionDir, meta, signal)
      : undefined;
    const history = await openHistoryFiles(sessionDir, meta);
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

    // New arrivals belong to live delivery, after this buffered snapshot.
    for (let remaining = live.buffer.length; remaining > 0; remaining--) {
      if (signal?.aborted) break;
      const line = live.buffer.shift()!;
      const event = parseEventLine(line, options, eventFilter, since);
      if (event) {
        idleTimer?.refresh();
        yield event;
      }
    }

    while (!signal?.aborted) {
      const line = await live.next();
      if (line == null || signal?.aborted) break;
      idleTimer?.refresh();
      const event = parseEventLine(line, options, eventFilter, since);
      if (event) yield event;
    }
  } finally {
    clearTimeout(idleTimer);
    abort?.abort();
  }
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
  const buffer = new Queue<string>();
  let waiter: ((line: string | null) => void) | undefined;
  let closed = false;

  const push = (line: string | null) => {
    if (waiter) {
      const resolve = waiter;
      waiter = undefined;
      resolve(line);
    } else if (line != null) buffer.push(line);
  };

  const close = () => rl.close();
  rl.on('line', line => push(line));
  rl.on('close', () => {
    closed = true;
    push(null);
    socket.destroy();
    signal?.removeEventListener('abort', close);
  });
  socket.on('error', close);
  signal?.addEventListener('abort', close, { once: true });
  if (signal?.aborted) close();

  return {
    buffer,
    next() {
      const line = buffer.shift();
      if (line !== undefined) return Promise.resolve(line);
      if (closed) return Promise.resolve(null);
      return new Promise<string | null>(resolve => (waiter = resolve));
    },
  };
}

function createTapAbortController(options: TapOptions, follow: boolean) {
  if (!follow) return undefined;

  const abort = new AbortController();
  const timer =
    options.timeout != null ? setAbortTimer(abort, options.timeout) : undefined;
  const onAbort = () => abort.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  abort.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    },
    { once: true }
  );
  if (options.signal?.aborted) abort.abort();
  return abort;
}

function setAbortTimer(abort: AbortController, timeout: number) {
  return setTimeout(() => abort.abort(), timeout).unref();
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
