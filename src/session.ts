import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

import {
  DEFAULT_SEGMENTS,
  DEFAULT_SEGMENT_SIZE,
  EVENT_LOG_FORMAT_VERSION,
  SESSION_FILES,
} from './constants';
import { cleanStaleSessionsSync, getSessionBaseDir } from './clean';
import { createDebugSink } from './debug';
import { BroadcastChannel } from './utils/broadcastChannel';
import { LogStream, type EventSink } from './utils/logStream';
import { publishIpcPath } from './utils/ipc';
import { publishProcessOrigin } from './utils/processOrigin';
import { registerProcessCleanup } from './utils/processExit';
import {
  createSocketAddress,
  listenSocket,
  removeSocket,
} from './utils/sessionSockets';

export interface SessionOptions {
  command?: string;
  version?: string;
  maxSegments?: number;
  maxSegmentSize?: number;
}

export interface SessionMeta {
  pid: number;
  formatVersion: number;
  startedAt: number;
  command: string;
  cwd: string;
  maxSegments: number;
  version?: string;
  // Relative to meta.json, or a Windows named-pipe name
  socket: string;
  ipcSocket: string;
  origin: {
    argv: string[];
    execPath: string;
    cwd: string;
    ppid?: number;
    env?: {
      npmLifecycleEvent?: string;
      npmExecPath?: string;
      npmPackageName?: string;
    };
  };
}

export interface SessionContext {
  sessionDir: string;
  meta: SessionMeta;
  sink: EventSink;
  destroy(): void;
}

export function createSession(options: SessionOptions): SessionContext {
  const baseDir = getSessionBaseDir();
  const startedAt = Date.now();
  // The name is collision-free across PID reuse and never parsed by readers
  const sessionId = `${process.pid}-${startedAt.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .padEnd(6, '0')}`;
  const sessionDir = path.join(baseDir, sessionId);
  // An unwritable tmpdir must not crash the host
  try {
    fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
    // A base dir created before permissions were restricted stays 0755
    fs.chmodSync(baseDir, 0o700);
  } catch {}

  const maxSegments = options.maxSegments ?? DEFAULT_SEGMENTS;
  const maxSegmentSize = options.maxSegmentSize ?? DEFAULT_SEGMENT_SIZE;
  const liveSocket = createSocketAddress(sessionDir, sessionId, 'live');
  const ipcSocket = createSocketAddress(sessionDir, sessionId, 'ipc');

  const fileStream = new LogStream(path.join(sessionDir, '0.jsonl'));
  const sink = new BroadcastChannel(fileStream);
  sink.add(createDebugSink());
  trackSegmentRotation(fileStream, sessionDir, maxSegments, maxSegmentSize);

  const liveServer = net.createServer(socket => sink.attach(socket));
  const ipcServer = net.createServer(socket => sink.ingest(socket));
  const closeLiveServer = listenSocket(liveServer, liveSocket.path);
  const closeIpcServer = listenSocket(ipcServer, ipcSocket.path);
  const restoreIpcPath = publishIpcPath(ipcSocket.path);
  const restoreProcessOrigin = publishProcessOrigin();

  const meta: SessionMeta = {
    pid: process.pid,
    formatVersion: EVENT_LOG_FORMAT_VERSION,
    startedAt,
    command: options.command ?? process.argv.slice(1).join(' '),
    cwd: process.cwd(),
    maxSegments,
    version: options.version,
    socket: liveSocket.name,
    ipcSocket: ipcSocket.name,
    origin: createSessionOrigin(),
  };
  // Without meta.json the session is invisible to tooling; logging still works
  try {
    writeJsonAtomic(path.join(sessionDir, SESSION_FILES.meta), meta);
  } catch {}

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    sink.destroy();
    closeLiveServer();
    closeIpcServer();
    restoreIpcPath();
    restoreProcessOrigin();
    // rmSync can throw EPERM/EBUSY and must not skip the restoration above
    removeSocket(liveSocket.path);
    removeSocket(ipcSocket.path);
  };

  registerProcessCleanup(destroy);

  // Stale-session cleanup stays off the install hot path
  setImmediate(() => {
    try {
      cleanStaleSessionsSync();
    } catch {}
  });

  return { sessionDir, meta, sink, destroy };
}

function trackSegmentRotation(
  stream: LogStream,
  sessionDir: string,
  maxSegments: number,
  maxSegmentSize: number
) {
  let bytesWritten = 0;
  stream.on('write', written => {
    bytesWritten += written;
    if (bytesWritten < maxSegmentSize) return;
    bytesWritten = 0;
    rotateSegments(sessionDir, maxSegments);
    stream.reopen();
  });
}

function rotateSegments(sessionDir: string, maxSegments: number) {
  fs.rmSync(path.join(sessionDir, `${maxSegments - 1}.jsonl`), { force: true });
  for (let i = maxSegments - 1; i >= 1; i--) {
    const from = path.join(sessionDir, `${i - 1}.jsonl`);
    const to = path.join(sessionDir, `${i}.jsonl`);
    try {
      fs.renameSync(from, to);
    } catch {}
  }
}

function writeJsonAtomic(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function createSessionOrigin(): SessionMeta['origin'] {
  const env = {
    npmLifecycleEvent: process.env.npm_lifecycle_event,
    npmExecPath: process.env.npm_execpath,
    npmPackageName: process.env.npm_package_name,
  };
  return {
    argv: process.argv.slice(1),
    execPath: process.execPath,
    cwd: process.cwd(),
    ppid: process.ppid || undefined,
    env: Object.values(env).some(Boolean) ? env : undefined,
  };
}
