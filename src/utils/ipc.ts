import net from 'node:net';

import { INTERNAL_IPC_ENV } from '../constants';
import type { LogStreamOpener } from './logStream';

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
