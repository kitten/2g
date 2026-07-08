import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { SESSION_FILES } from '../constants';

export interface SocketAddress {
  // Relative to the session dir, or a Windows named-pipe name
  name: string;
  path: string;
}

// Windows net servers cannot listen on filesystem paths
export function createSocketAddress(
  sessionDir: string,
  sessionId: string,
  kind: 'live' | 'ipc'
): SocketAddress {
  const name =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\event-log-${sessionId}-${kind}`
      : kind === 'live'
        ? SESSION_FILES.liveSocket
        : SESSION_FILES.ipcSocket;
  return { name, path: resolveSocketPath(sessionDir, name) };
}

// Meta socket values are relative to the session dir; pipe names are never relative
export function resolveSocketPath(sessionDir: string, value: string) {
  return value.startsWith('\\\\') ? value : path.join(sessionDir, value);
}

// Pipes are not filesystem entries
export function removeSocket(socketPath: string) {
  if (!socketPath.startsWith('\\\\')) fs.rmSync(socketPath, { force: true });
}

export function listenSocket(server: net.Server, socketPath: string) {
  let closed = false;
  let listening = false;
  let shouldClose = false;

  // Session sockets must never hold the host process open
  server.unref();

  const close = () => {
    shouldClose = true;
    if (listening && !closed) server.close();
  };

  server.once('listening', () => {
    listening = true;
    if (shouldClose) close();
  });
  server.once('close', () => {
    closed = true;
    listening = false;
  });
  server.on('error', () => {
    closed = true;
    try {
      server.close(() => {});
    } catch {}
  });
  server.listen(socketPath);

  return close;
}
