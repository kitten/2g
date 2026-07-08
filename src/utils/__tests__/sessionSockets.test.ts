import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listenSocket } from '../sessionSockets';

describe('listenSocket', () => {
  it('can close before the server starts listening', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-socket-'));
    const socketPath = testSocketPath(dir, 'test.sock');
    const server = net.createServer();

    try {
      const close = listenSocket(server, socketPath);
      close();
      await once(server, 'close');
      expect(server.listening).toBe(false);
    } finally {
      server.close(() => {});
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('swallows listen errors and closes the server', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-socket-'));
    const socketPath = testSocketPath(dir, 'test.sock');
    const first = net.createServer();
    const second = net.createServer();

    try {
      await new Promise<void>(resolve => first.listen(socketPath, resolve));
      listenSocket(second, socketPath);
      await once(second, 'close');
      expect(second.listening).toBe(false);
    } finally {
      first.close(() => {});
      second.close(() => {});
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

let socketCount = 0;

// Windows net servers cannot listen on filesystem paths
function testSocketPath(dir: string, name: string) {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\event-log-test-${process.pid}-${socketCount++}-${name}`
    : path.join(dir, name);
}

function once(target: net.Server, event: 'close') {
  return new Promise<void>(resolve => target.once(event, resolve));
}
