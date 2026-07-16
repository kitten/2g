import type net from 'node:net';

import { ingestIpcSocket } from './ipc';
import { LogStream, type EventSink } from './logStream';

const MAX_SUBSCRIBER_BUFFERED = 4 * 1024 * 1024;

interface BroadcastSink {
  sink: EventSink;
  dropOnBackpressure: boolean;
  destroy(): void;
}

// Fallback for Windows named pipes, which expose no fd for LogStream to write to
class SocketSink implements EventSink {
  readonly #socket: net.Socket;

  constructor(socket: net.Socket) {
    this.#socket = socket;
    // A socket write error without an 'error' listener would crash the host
    socket.on('error', () => {});
  }

  get writable() {
    return this.#socket.writable;
  }

  get buffered() {
    return this.#socket.writableLength;
  }

  _writeln(data: string): boolean {
    return this.#socket.write(data);
  }

  end(cb?: () => void): this {
    this.#socket.end(cb);
    return this;
  }

  destroy() {
    this.#socket.destroy();
  }
}

const createSocketSink = (socket: net.Socket): EventSink => {
  const fd = (socket as any)._handle?.fd;
  if (typeof fd === 'number' && fd >= 0) {
    return new LogStream(
      onOpened =>
        onOpened(null, fd, (data, cb) => {
          socket.write(data, cb);
        }),
      { closeFd: false }
    );
  }
  return new SocketSink(socket);
};

// Fans every line out to all sinks uniformly; only flush stays pinned to the
// primary sink so a stalled live socket cannot delay a durability barrier
export class BroadcastChannel implements EventSink {
  readonly #primary: EventSink;
  readonly #sinks: BroadcastSink[] = [];
  #destroyed = false;

  constructor(primary: EventSink) {
    this.#primary = primary;
    this.#sinks.push({
      sink: primary,
      dropOnBackpressure: false,
      destroy: () => primary.destroy(),
    });
  }

  get writable() {
    if (this.#destroyed) return false;
    for (let i = 0; i < this.#sinks.length; i++) {
      if (this.#sinks[i].sink.writable) return true;
    }
    return false;
  }

  add(sink: EventSink | null) {
    if (!sink) return;
    if (this.#destroyed) sink.destroy();
    else
      this.#sinks.push({
        sink,
        dropOnBackpressure: false,
        destroy: () => sink.destroy(),
      });
  }

  attach(socket: net.Socket) {
    if (this.#destroyed) {
      socket.destroy();
      return;
    }
    socket.unref();
    const sink = createSocketSink(socket);
    const entry = {
      sink,
      dropOnBackpressure: true,
      destroy: () => {
        sink.destroy();
        socket.destroy();
      },
    };
    this.#sinks.push(entry);
    const detach = () => {
      const index = this.#sinks.indexOf(entry);
      if (index > -1) this.#sinks.splice(index, 1);
      entry.destroy();
    };
    socket.on('close', detach);
    socket.on('error', detach);
  }

  ingest(socket: net.Socket) {
    ingestIpcSocket(socket, this);
  }

  _writeln(line: string): boolean {
    const sinks = this.#sinks;
    let writable = false;
    for (let i = sinks.length - 1; i >= 0; i--) {
      const entry = sinks[i];
      const accepted = entry.sink._writeln(line);
      if (
        !accepted &&
        entry.dropOnBackpressure &&
        (entry.sink.buffered ?? Infinity) > MAX_SUBSCRIBER_BUFFERED
      ) {
        sinks.splice(i, 1);
        entry.destroy();
      }
      writable = accepted || writable;
    }
    return writable;
  }

  flush(cb: (error?: Error | null) => void) {
    if (this.#primary.flush) this.#primary.flush(cb);
    else cb();
  }

  end(cb?: () => void): this {
    for (const entry of this.#sinks) {
      entry.sink.end(entry.sink === this.#primary ? cb : undefined);
    }
    return this;
  }

  destroy() {
    this.#destroyed = true;
    for (const entry of this.#sinks) entry.destroy();
    this.#sinks.length = 0;
  }
}
