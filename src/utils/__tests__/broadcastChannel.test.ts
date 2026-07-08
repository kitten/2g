import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BroadcastChannel } from '../broadcastChannel';
import type { EventSink } from '../logStream';

describe('BroadcastChannel', () => {
  it('reassembles ingested chunks into complete lines', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-ingest-'));
    const socketPath =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\event-log-test-${process.pid}-ingest`
        : path.join(dir, 'ipc.sock');

    const written: string[] = [];
    const primary: EventSink = {
      writable: true,
      _writeln(data) {
        written.push(data);
        return true;
      },
      end() {
        return this;
      },
      destroy() {},
    };
    const channel = new BroadcastChannel(primary);
    const server = net.createServer(socket => channel.ingest(socket));

    try {
      await new Promise<void>(resolve => server.listen(socketPath, resolve));
      const client = net.connect(socketPath);
      await new Promise<void>(resolve => client.once('connect', resolve));

      client.write('{"a":1}\n{"b"');
      await waitFor(() => written.join('').includes('{"a":1}'));
      expect(written.join('')).toBe('{"a":1}\n');

      client.write(':2}\n{"c":3}\n');
      await waitFor(() => written.join('').includes('{"c":3}'));
      expect(written.join('')).toBe('{"a":1}\n{"b":2}\n{"c":3}\n');
      client.destroy();
    } finally {
      server.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('disconnects backpressured live subscribers', () => {
    const written: string[] = [];
    const primary: EventSink = {
      writable: true,
      _writeln(data) {
        written.push(data);
        return true;
      },
      end() {
        return this;
      },
      destroy() {},
    };
    const channel = new BroadcastChannel(primary);
    let destroyed = false;
    const socket = {
      writable: true,
      writableLength: 8 * 1024 * 1024,
      write: () => false,
      destroy: () => {
        destroyed = true;
      },
      on: () => socket,
      unref: () => socket,
    } as unknown as net.Socket;

    channel.attach(socket);
    channel._writeln('line\n');
    channel._writeln('next\n');

    expect(destroyed).toBe(true);
    expect(written.join('')).toBe('line\nnext\n');
  });

  it('keeps a live subscriber attached through a synchronous burst', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-burst-'));
    const socketPath =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\event-log-test-${process.pid}-burst`
        : path.join(dir, 'live.sock');

    const primary: EventSink = {
      writable: true,
      _writeln() {
        return true;
      },
      end() {
        return this;
      },
      destroy() {},
    };
    const channel = new BroadcastChannel(primary);
    const server = net.createServer(socket => channel.attach(socket));

    try {
      await new Promise<void>(resolve => server.listen(socketPath, resolve));
      const client = net.connect(socketPath);
      await new Promise<void>(resolve => client.once('connect', resolve));
      await new Promise(resolve => setTimeout(resolve, 25));

      let received = '';
      client.setEncoding('utf8');
      client.on('data', chunk => (received += chunk));

      const line = `${JSON.stringify({ _e: 'bench:burst', pad: 'x'.repeat(180) })}\n`;
      for (let i = 0; i < 1000; i++) channel._writeln(line);

      await waitFor(() => received.split('\n').length > 1000);
      expect(received.split('\n')).toHaveLength(1001);
      client.destroy();
    } finally {
      server.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 40; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for condition');
}
