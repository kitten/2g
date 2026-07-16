import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { INTERNAL_IPC_ENV } from '../constants';
import type { EventSink, LogStream, LogStreamOpener } from './logStream';
import { registerProcessCleanup } from './processExit';
import { listenSocket, removeSocket } from './sessionSockets';

const CONNECT_RETRY_MS = 50;
const MAX_CONNECT_RETRY_MS = 750;

export function getParentIpcPath() {
  return process.env[INTERNAL_IPC_ENV];
}

export function publishIpcPath(socketPath: string) {
  process.env[INTERNAL_IPC_ENV] = socketPath;
  return () => {
    if (process.env[INTERNAL_IPC_ENV] === socketPath)
      delete process.env[INTERNAL_IPC_ENV];
  };
}

export function listenIpcSink(sink: EventSink, socketPath: string) {
  const server = net.createServer(socket => ingestIpcSocket(socket, sink));
  const closeServer = listenSocket(server, socketPath);
  const restoreIpcPath = publishIpcPath(socketPath);

  return () => {
    closeServer();
    restoreIpcPath();
  };
}

function createTempIpcPath() {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  const id = `${process.pid}-${now}-${rand}`;
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\event-log-${id}-ipc`
    : path.join(os.tmpdir(), `event-log-${id}.sock`);
}

export function publishTempIpcSink(sink: LogStream) {
  const socketPath = createTempIpcPath();
  const closeIpc = listenIpcSink(sink, socketPath);
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    closeIpc();
    removeSocket(socketPath);
  };

  const destroy = sink.destroy.bind(sink);
  sink.destroy = () => {
    cleanup();
    destroy();
  };
  sink.once('close', cleanup);
  registerProcessCleanup(cleanup);
}

export interface OpenIpcOptions {
  retryMs?: number;
  maxRetryMs?: number;
}

export function openIpc(
  socketPath: string,
  options: OpenIpcOptions = {}
): LogStreamOpener {
  const retryMs = options.retryMs ?? CONNECT_RETRY_MS;
  const maxRetryMs = options.maxRetryMs ?? MAX_CONNECT_RETRY_MS;

  return (onOpened, stream) => {
    const startedAt = Date.now();
    const retry = (error: Error, attempt: () => void) => {
      if (Date.now() - startedAt > maxRetryMs) onOpened(error);
      else setTimeout(attempt, retryMs);
    };

    const attempt = () => {
      const socket = net.connect(socketPath);
      let opened = false;
      socket.once('connect', () => {
        const fd = (socket as any)._handle?.fd;
        opened = true;
        socket.unref();
        // The socket owns the borrowed fd; its close must stop the stream
        socket.once('close', () => stream.destroy());
        // A pending drain must keep the process alive until it flushes
        const drain = (data: string, cb: (error?: Error | null) => void) => {
          socket.ref();
          socket.write(data, error => {
            socket.unref();
            cb(error);
          });
        };
        if (typeof fd === 'number' && fd >= 0) {
          onOpened(null, fd, drain);
        } else {
          onOpened(null, null, drain);
        }
      });
      socket.once('error', error => {
        if (opened) return;
        socket.destroy();
        retry(error, attempt);
      });
    };
    attempt();
  };
}

export function ingestIpcSocket(socket: net.Socket, sink: EventSink) {
  // Forward complete lines as one block; hold back only the partial tail.
  let pending = '';
  socket.unref();
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    const data = pending ? pending + chunk : chunk;
    const end = data.lastIndexOf('\n');
    if (end === data.length - 1) {
      pending = '';
      sink._writeln(data);
    } else if (end === -1) {
      pending = data;
    } else {
      pending = data.slice(end + 1);
      sink._writeln(data.slice(0, end + 1));
    }
  });
  socket.on('error', () => {});
}
