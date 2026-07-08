import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

const BUSY_WRITE_TIMEOUT = 100;
const HIGH_WATER_MARK = 16_384;
const WRITE_BATCH_SIZE = 65_536;

export interface EventSink {
  readonly writable: boolean;
  readonly file?: string | null;
  readonly buffered?: number;
  _writeln(data: string): boolean;
  flush?(cb: (error?: Error | null) => void): void;
  end(cb?: () => void): this;
  destroy(): void;
}

export interface LogStreamOptions {
  closeFd?: boolean;
}

export type LogStreamDrain = (
  data: string,
  cb: (error?: Error | null) => void
) => void;

export type LogStreamOpener = (
  onOpened: (
    error: Error | null,
    fd?: number | null,
    drain?: LogStreamDrain
  ) => void,
  stream: LogStream
) => void;

export class LogStream
  extends EventEmitter
  implements NodeJS.WritableStream, EventSink
{
  #fd = -1;
  #file: string | null = null;
  #oldFd: number | null = null;
  #closeFd = true;

  #writing = false;
  #ending = false;
  #closing = false;
  #flushPending = false;
  #destroyed = false;
  #opening = false;
  #reopening = false;

  #output = '';
  #len = 0;
  #lines: string[] = [];
  #head = 0;
  #partialLine = 0;
  #busyRetries = 0;
  #draining = false;
  #scheduled = false;
  #drain?: LogStreamDrain;

  #onRelease = (err: NodeJS.ErrnoException | null, written: number) => {
    this.#release(err, written);
  };

  #onDrained = (error?: Error | null) => {
    if (error != null) {
      this.#fail(error as NodeJS.ErrnoException);
    } else {
      this.#release(null, Buffer.byteLength(this.#output));
    }
  };

  #onScheduledWrite = () => {
    this.#scheduled = false;
    if (
      !this.#writing &&
      !this.#destroyed &&
      (this.#lines.length - this.#head > this.#partialLine || this.#output)
    ) {
      this.#writeLine();
    }
  };

  constructor(
    dest: string | number | LogStreamOpener,
    options: LogStreamOptions = {}
  ) {
    super();
    this.#closeFd = options.closeFd !== false;
    if (typeof dest === 'number') {
      try {
        fs.fsyncSync(dest);
      } catch {}
      this.#fd = dest;
      process.nextTick(() => this.emit('ready'));
    } else if (typeof dest === 'string') {
      this.#openFile(dest);
    } else {
      this.#open(dest, null);
    }
  }

  get file(): string | null {
    return this.#file;
  }

  get fd(): number {
    return this.#fd;
  }

  get writing(): boolean {
    return this.#writing;
  }

  get buffered(): number {
    return this.#len;
  }

  get writable(): boolean {
    return !this.#destroyed && !this.#ending;
  }

  reopen(file = this.#file) {
    if (this.#file == null)
      throw new Error('Cannot reopen an fd-only LogStream');
    if (this.#destroyed || this.#ending) return;
    if (file) this.#file = file;
    if (this.#opening) {
      this.once('ready', () => this.reopen(file));
      return;
    }
    this.#reopening = true;
    if (!this.#writing) this.#reopen();
  }

  #reopen() {
    if (this.#file == null) return;
    this.#reopening = false;
    this.#oldFd = this.#fd;
    this.#openFile(this.#file);
  }

  #retryLine(error: NodeJS.ErrnoException) {
    if (error.code === 'EAGAIN' && this.#drain != null) {
      this.#draining = true;
      this.#drain(this.#output, this.#onDrained);
    } else if (this.#busyRetries === 0) {
      this.#busyRetries = 1;
      setImmediate(() => this.#writeLine());
    } else {
      this.#busyRetries = Math.min(this.#busyRetries * 2, BUSY_WRITE_TIMEOUT);
      setTimeout(() => this.#writeLine(), this.#busyRetries);
    }
  }

  #release(error: NodeJS.ErrnoException | null, written: number) {
    if (error) {
      if (error.code === 'EAGAIN' || error.code === 'EBUSY') {
        this.#retryLine(error);
      } else {
        this.#fail(error);
      }
      return;
    }

    this.#busyRetries = 0;
    this.emit('write', written);

    if (written === this.#output.length) {
      // Complete write; exact for ASCII, the common case for JSONL
      this.#len -= this.#output.length;
      this.#output = '';
    } else {
      const outputLength = Buffer.byteLength(this.#output);
      if (outputLength > written) {
        const output = Buffer.from(this.#output).toString('utf8', written);
        this.#len -= this.#output.length - output.length;
        this.#output = output;
      } else {
        this.#len -= this.#output.length;
        this.#output = '';
      }
    }

    if (this.#output) {
      this.#writeLine();
    } else if (this.#closing && !this.#ending) {
      this.#writing = false;
      this.#close();
    } else if (this.#lines.length - this.#head > this.#partialLine) {
      this.#writeLine();
    } else if (this.#reopening) {
      this.#writing = false;
      this.#reopen();
    } else if (this.#ending) {
      this.#writing = false;
      this.#close();
    } else {
      this.#writing = false;
      this.#draining = false;
      if (this.#flushPending) {
        this.emit('drain');
      }
    }
  }

  #openFile(file: string) {
    this.#open(onOpened => {
      fs.mkdir(path.dirname(file), { recursive: true }, () => {
        fs.open(file, 'a', 0o600, (error, fd) => {
          if (error || fd == null) {
            onOpened(error);
            return;
          }
          fs.fchmod(fd, 0o600, () => {
            onOpened(null, fd);
          });
        });
      });
    }, file);
  }

  #open(open: LogStreamOpener, file: string | null) {
    this.#opening = true;
    this.#writing = true;

    const onOpened = (
      error: Error | null,
      fd?: number | null,
      drain?: LogStreamDrain
    ) => {
      const oldFd = this.#oldFd;
      this.#oldFd = null;
      if (error) {
        this.#opening = false;
        this.#fail(error as NodeJS.ErrnoException);
      } else {
        this.#fd = fd ?? -1;
        this.#file = file;
        this.#drain = drain;
        this.#opening = false;
        this.#writing = false;
        this.emit('ready');
        if (oldFd != null && oldFd !== this.#fd && !isStdFd(oldFd)) {
          fsFsync(oldFd, () => fs.close(oldFd, () => {}));
        }
        if (this.#destroyed) return;
        if (this.#closing) {
          this.#close();
        } else if (
          (!this.#writing &&
            this.#lines.length - this.#head > this.#partialLine) ||
          this.#flushPending
        ) {
          this.#writeLine();
        }
      }
    };

    open(onOpened, this);
  }

  #close() {
    if (this.#fd === -1 && this.#opening) {
      this.once('ready', () => this.#close());
      return;
    }

    this.#destroyed = true;
    this.#partialLine = 0;
    this.#lines.length = 0;
    this.#head = 0;

    const onClose = (error?: NodeJS.ErrnoException | null) => {
      if (error) {
        this.emit('error', error);
        this.emit('close', error);
      } else {
        if (this.#ending && !this.#writing) this.emit('finish');
        this.emit('close');
      }
    };

    if (this.#fd < 0) {
      onClose();
      return;
    }

    fsFsync(this.#fd, error => {
      if (!error && this.#closeFd && !isStdFd(this.#fd)) {
        fs.close(this.#fd, onClose);
      } else {
        onClose(); // Error intentionally ignored, assume closed
      }
    });
  }

  #fail(error: NodeJS.ErrnoException) {
    this.#writing = false;
    if (this.listenerCount('error')) this.emit('error', error);
    this.#close();
  }

  #scheduleWrite() {
    if (!this.#scheduled) {
      this.#scheduled = true;
      setImmediate(this.#onScheduledWrite);
    }
  }

  #writeLine() {
    this.#writing = true;
    if (!this.#output) {
      const end = this.#lines.length - this.#partialLine;
      if (end > this.#head) {
        this.#output = this.#lines[this.#head++] || '';
        // Batch accumulated lines into one write to avoid per-line syscalls
        while (this.#head < end && this.#output.length < WRITE_BATCH_SIZE) {
          this.#output += this.#lines[this.#head++];
        }
        if (this.#head === this.#lines.length) {
          this.#lines.length = 0;
          this.#head = 0;
        }
      }
    }
    // A deep queue under backpressure stays writability-paced until it empties
    if (this.#drain != null && (this.#draining || this.#fd < 0)) {
      this.#drain(this.#output, this.#onDrained);
    } else {
      fs.write(this.#fd, this.#output, this.#onRelease);
    }
  }

  _end() {
    if (!this.#destroyed && !this.#ending) {
      this.#ending = true;
      if (this.#opening) {
        this.once('ready', () => this._end());
      } else if (!this.#writing && this.#fd >= 0) {
        if (this.#lines.length - this.#head > this.#partialLine) {
          this.#writeLine();
        } else {
          this.#close();
        }
      }
    }
    return this;
  }

  end(cb?: () => void): this;
  end(data: string | Uint8Array, cb?: () => void): this;
  end(str: string, encoding?: BufferEncoding, cb?: () => void): this;

  end(
    arg1?: Uint8Array | string | (() => void),
    arg2?: BufferEncoding | (() => void),
    arg3?: () => void
  ) {
    const maybeCb = arg3 || arg2 || arg1;
    const input = typeof arg1 !== 'function' ? arg1 : undefined;
    const encoding = typeof arg2 === 'string' ? arg2 : 'utf8';
    const cb = typeof maybeCb === 'function' ? maybeCb : undefined;
    if (typeof input === 'string') {
      this.write(input, encoding);
    } else if (input != null) {
      this.write(input);
    }
    if (cb) this.once('close', cb);
    return this._end();
  }

  destroy() {
    if (this.#destroyed || this.#closing) return;
    if (this.#writing || this.#opening) {
      this.#closing = true;
    } else if (this.#lines.length - this.#head > this.#partialLine) {
      // A scheduled write counts as pending: complete it before closing
      this.#closing = true;
      this.#writeLine();
    } else {
      this.#close();
    }
  }

  flush(cb?: (error?: Error | null) => void) {
    if (this.#destroyed) {
      cb?.();
    } else {
      const onDrain = () => {
        if (!this.#destroyed) {
          fsFsync(this.#fd, error => {
            this.#flushPending = false;
            if (error?.code === 'EBADF') {
              cb?.(); // If fd is closed, ignore the error
            } else {
              cb?.(error);
            }
          });
        } else {
          this.#flushPending = false;
          cb?.();
        }
        this.off('error', onError);
      };

      const onError = (err: Error) => {
        this.#flushPending = false;
        this.off('drain', onDrain);
        cb?.(err);
      };

      this.#flushPending = true;
      this.once('drain', onDrain);
      this.once('error', onError);

      if (!this.#writing) {
        if (
          this.#lines.length - this.#head > this.#partialLine ||
          this.#output
        ) {
          this.#writeLine();
        } else {
          process.nextTick(() => this.emit('drain'));
        }
      }
    }
  }

  _writeln(data: string): boolean {
    if (this.#destroyed) return false;
    this.#len += data.length;
    this.#lines.push(data);
    if (!this.#writing) this.#scheduleWrite();
    return this.#len < HIGH_WATER_MARK;
  }

  _write(data: string): boolean {
    if (this.#destroyed) {
      return false;
    }

    if (
      this.#partialLine === 0 &&
      data.charCodeAt(data.length - 1) === 10 /*'\n'*/
    ) {
      return this._writeln(data);
    }

    this.#len += data.length;

    let startIdx = 0;
    let endIdx = -1;
    while ((endIdx = data.indexOf('\n', startIdx)) > -1) {
      const line = data.slice(startIdx, endIdx + 1);
      if (this.#partialLine > 0) {
        this.#lines[this.#lines.length - 1] += line;
      } else {
        this.#lines.push(line);
      }
      this.#partialLine = 0;
      startIdx = ++endIdx;
    }

    if (startIdx < data.length) {
      const line = data.slice(startIdx);
      if (this.#partialLine > 0) {
        this.#lines[this.#lines.length - 1] += line;
      } else {
        this.#lines.push(data.slice(startIdx));
      }
      this.#partialLine = 1;
    }

    if (!this.#writing && this.#lines.length - this.#head > this.#partialLine) {
      this.#scheduleWrite();
    }

    return this.#len < HIGH_WATER_MARK;
  }

  write(
    buffer: Uint8Array | string,
    cb?: (err?: Error | null) => void
  ): boolean;
  write(
    str: string,
    encoding?: BufferEncoding,
    cb?: (err?: Error | null) => void
  ): boolean;

  write(
    input: Uint8Array | string,
    arg2?: BufferEncoding | ((err?: Error | null) => void),
    arg3?: (err?: Error | null) => void
  ): boolean {
    const maybeCb = arg3 || arg2;
    const encoding = typeof arg2 === 'string' ? arg2 : 'utf8';
    const data =
      typeof input === 'string' ? input : Buffer.from(input).toString(encoding);
    const cb = typeof maybeCb === 'function' ? maybeCb : undefined;
    try {
      return this._write(data);
    } finally {
      cb?.();
    }
  }

  [Symbol.dispose]() {
    this.destroy();
  }
}

const isStdFd = (fd: number) => {
  switch (fd) {
    case 1:
    case 2:
    case process.stdout.fd:
    case process.stderr.fd:
      return true;
    default:
      return false;
  }
};

const fsFsync = (
  fd: number,
  cb: (error?: NodeJS.ErrnoException | null) => void
) => {
  try {
    fs.fsync(fd, cb);
  } catch (error: any) {
    cb(error);
  }
};
