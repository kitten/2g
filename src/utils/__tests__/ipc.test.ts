import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LogStream } from '../logStream';
import { openIpc } from '../ipc';

describe('openIpc', () => {
  it('buffers all lines until the socket accepts a connection', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-retry-'));
    const socketPath = testSocketPath(dir, 'ipc.sock');
    const sink = new LogStream(openIpc(socketPath), { closeFd: false });

    for (let i = 0; i < 1_100; i++) {
      sink._writeln(`${i}\n`);
    }

    const received: string[] = [];
    const server = net.createServer(socket => {
      socket.on('data', chunk => received.push(chunk.toString('utf8')));
    });

    try {
      await new Promise<void>(resolve => server.listen(socketPath, resolve));
      await waitFor(() => received.join('').split('\n').length > 1_100);
      expect(received.join('')).toContain('0\n');
      expect(received.join('')).toContain('1099\n');
    } finally {
      sink.destroy();
      server.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('delegates writes to the connected socket after the handshake', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-retry-'));
    const socketPath = testSocketPath(dir, 'ipc.sock');

    const received: string[] = [];
    const server = net.createServer(socket => {
      socket.on('data', chunk => received.push(chunk.toString('utf8')));
    });

    try {
      await new Promise<void>(resolve => server.listen(socketPath, resolve));
      const sink = new LogStream(openIpc(socketPath), { closeFd: false });
      sink._writeln('before\n');
      await waitFor(() => received.join('').includes('before\n'));

      expect(sink._writeln('after\n')).toBe(true);
      await new Promise<void>(resolve => sink.flush(() => resolve()));
      await waitFor(() => received.join('').includes('after\n'));
      expect(sink.writable).toBe(true);
      sink.destroy();
    } finally {
      server.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('becomes unwritable when the parent closes the connection', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-retry-'));
    const socketPath = testSocketPath(dir, 'ipc.sock');

    const server = net.createServer(socket => socket.destroy());

    try {
      await new Promise<void>(resolve => server.listen(socketPath, resolve));
      const sink = new LogStream(openIpc(socketPath), { closeFd: false });
      sink._writeln('line\n');
      await waitFor(() => !sink.writable);
      expect(sink._writeln('dropped\n')).toBe(false);
      sink.destroy();
    } finally {
      server.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('drains in order when the parent applies backpressure', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-retry-'));
    const socketPath = testSocketPath(dir, 'ipc.sock');

    const received: Buffer[] = [];
    const server = net.createServer(socket => {
      socket.pause();
      setTimeout(() => {
        socket.on('data', (chunk: Buffer) => received.push(chunk));
        socket.resume();
      }, 100);
    });

    try {
      await new Promise<void>(resolve => server.listen(socketPath, resolve));
      const sink = new LogStream(openIpc(socketPath), { closeFd: false });

      let expected = '';
      for (let i = 0; i < 40_000; i++) {
        const line = `${String(i).padStart(6, '0')}${'x'.repeat(57)}\n`;
        expected += line;
        sink._writeln(line);
      }
      await new Promise<void>(resolve => sink.flush(() => resolve()));
      await waitFor(
        () =>
          received.reduce((size, chunk) => size + chunk.length, 0) >=
          expected.length
      );

      expect(Buffer.concat(received).toString('utf8')).toBe(expected);
      sink.destroy();
    } finally {
      server.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('silently bails out when the parent socket never appears', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-retry-'));
    const socketPath = testSocketPath(dir, 'missing.sock');
    const sink = new LogStream(
      openIpc(socketPath, { retryMs: 1, maxRetryMs: 5 }),
      { closeFd: false }
    );

    try {
      sink._writeln('before\n');
      await waitFor(() => !sink.writable);
      expect(sink._writeln('after\n')).toBe(false);
    } finally {
      sink.destroy();
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

async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 120; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for condition');
}
