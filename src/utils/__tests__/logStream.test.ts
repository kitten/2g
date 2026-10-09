import syncFs, { renameSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { LogStream, type LogStreamDrain } from '../logStream';

describe('logStream', () => {
  it('preserves queued lines and partial tails across repeated batch drains', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-queue-'));
    const file = path.join(dir, 'events.jsonl');
    const stream = new LogStream(file);
    let expected = '';

    try {
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 6000; i++) {
          const line = `${round}:${i}:${'漢😀'.repeat(32)}\n`;
          stream.write(line);
          expected += line;
        }
        stream.write('partial');
        await flush(stream);
        expect(await fs.readFile(file, 'utf8')).toBe(expected);
        expect(stream.buffered).toBe('partial'.length);
        expected += 'partial';
      }
      stream.end('\n');
      await once(stream, 'close');
      expect(await fs.readFile(file, 'utf8')).toBe(`${expected}\n`);
      expect(stream.buffered).toBe(0);
    } finally {
      stream.destroy();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it.each(['', 'queued\n', `${'x'.repeat(65_535)}\nqueued\n`])(
    'completes end requested before the file opens (%#)',
    async data => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-end-'));
      const file = path.join(dir, 'events.jsonl');
      const stream = new LogStream(file);
      const events: string[] = [];
      stream.on('finish', () => events.push('finish'));
      stream.on('close', () => events.push('close'));
      const ended = vi.fn(() => events.push('callback'));

      try {
        if (data) stream.write(data);
        stream.end(ended);
        expect(stream.writable).toBe(false);
        await waitFor(() => ended.mock.calls.length > 0);

        expect(events).toEqual(['finish', 'close', 'callback']);
        expect(await fs.readFile(file, 'utf8')).toBe(data);
        expect(() => syncFs.fstatSync(stream.fd)).toThrow();
      } finally {
        if (!events.includes('close')) {
          const closed = once(stream, 'close');
          stream.destroy();
          await closed;
        }
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  );

  it.each([
    ['split two-byte character', 'é\n', 1],
    ['byte count equals string length', 'é\n', 2],
    ['split three-byte character', '漢\n', 1],
    ['split surrogate pair', '😀\n', 1],
    ['mixed JSONL', '{"message":"café 漢字 😀"}\n', 3],
    ['ASCII', 'plain text\n', 3],
  ] as const)(
    'preserves bytes through partial writes: %s',
    async (_, line, limit) => {
      const dir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'event-log-unicode-')
      );
      const file = path.join(dir, 'events.jsonl');
      const stream = new LogStream(file);
      await once(stream, 'ready');
      const write = vi.spyOn(syncFs, 'write').mockImplementation(((
        fd: number,
        data: Buffer,
        offset: number,
        length: number,
        _position: null,
        cb: (error: null, written: number) => void
      ) => {
        const written = syncFs.writeSync(
          fd,
          data,
          offset,
          write.mock.calls.length <= 3 ? Math.min(length, limit) : length
        );
        setImmediate(() => cb(null, written));
      }) as typeof syncFs.write);

      try {
        stream._writeln(line);
        await flush(stream);
        expect(await fs.readFile(file)).toEqual(Buffer.from(line));
        expect(stream.buffered).toBe(0);
        stream._writeln('next\n');
        await flush(stream);
        expect(await fs.readFile(file)).toEqual(Buffer.from(`${line}next\n`));
        expect(stream.buffered).toBe(0);
      } finally {
        write.mockRestore();
        stream.destroy();
        await once(stream, 'close');
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  );

  it('preserves a partial UTF-8 tail when backpressure switches to socket draining', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-unicode-'));
    const file = path.join(dir, 'events.jsonl');
    const handle = await fs.open(file, 'w+');
    const drain = vi.fn<LogStreamDrain>((data, cb) => {
      syncFs.writeSync(handle.fd, Buffer.from(data));
      setImmediate(() => cb());
    });
    const stream = new LogStream(
      onOpened => setImmediate(() => onOpened(null, handle.fd, drain)),
      { closeFd: false }
    );
    await once(stream, 'ready');
    const write = vi.spyOn(syncFs, 'write').mockImplementation(((
      fd: number,
      data: Buffer,
      offset: number,
      length: number,
      _position: null,
      cb: (error: NodeJS.ErrnoException | null, written: number) => void
    ) => {
      if (write.mock.calls.length === 1) {
        const written = syncFs.writeSync(fd, data, offset, Math.min(length, 1));
        setImmediate(() => cb(null, written));
      } else {
        setImmediate(() =>
          cb(Object.assign(new Error('busy'), { code: 'EAGAIN' }), 0)
        );
      }
    }) as typeof syncFs.write);

    try {
      stream._writeln('😀\n');
      await flush(stream);
      expect(drain).toHaveBeenCalledTimes(1);
      expect(drain.mock.calls[0][0]).toEqual(Buffer.from('😀\n').subarray(1));
      expect(await fs.readFile(file)).toEqual(Buffer.from('😀\n'));
      expect(stream.buffered).toBe(0);
    } finally {
      write.mockRestore();
      stream.destroy();
      await once(stream, 'close');
      await handle.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('writes only the active bytes when reusing and growing the batch buffer', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-unicode-'));
    const file = path.join(dir, 'events.jsonl');
    const stream = new LogStream(file);
    const lines = [
      `${'漢'.repeat(65_536)}\n`,
      'ascii\n',
      `${'😀'.repeat(90_000)}\n`,
      'é\n',
    ];

    try {
      for (const line of lines) {
        stream._writeln(line);
        await flush(stream);
        expect(stream.buffered).toBe(0);
      }
      expect(await fs.readFile(file)).toEqual(Buffer.from(lines.join('')));
    } finally {
      stream.destroy();
      await once(stream, 'close');
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('reopens after the current batch before draining queued batches', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-stream-'));
    const file = path.join(dir, '0.jsonl');
    const rotated = path.join(dir, '1.jsonl');
    const stream = new LogStream(file);

    try {
      await once(stream, 'ready');
      const batch = `${'x'.repeat(65_535)}\n`;
      stream.once('write', () => {
        // Rotate synchronously, as the session's write listener does.
        renameSync(file, rotated);
        stream.reopen();
      });
      stream._writeln(batch);
      stream._writeln('queued\n');
      await flush(stream);

      expect(await fs.readFile(rotated, 'utf8')).toBe(batch);
      expect(await fs.readFile(file, 'utf8')).toBe('queued\n');
    } finally {
      stream.destroy();
      await once(stream, 'close');
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('reopens file streams without dropping queued lines', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-stream-'));
    const file = path.join(dir, '0.jsonl');
    const stream = new LogStream(file);
    await once(stream, 'ready');

    stream.write('before\n');
    await flush(stream);
    await fs.rename(file, path.join(dir, '1.jsonl'));

    stream.reopen();
    stream.write('after\n');
    stream.end();
    await once(stream, 'close');

    expect(await fs.readFile(path.join(dir, '1.jsonl'), 'utf8')).toBe(
      'before\n'
    );
    expect(await fs.readFile(file, 'utf8')).toBe('after\n');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('self-disables on unrecoverable write errors without a listener', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-badfd-'));
    const file = path.join(dir, 'events.jsonl');
    await fs.writeFile(file, '');
    const handle = await fs.open(file, 'r');
    const stream = new LogStream(handle.fd, { closeFd: false });

    stream._writeln('a\n');
    await waitFor(() => !stream.writable);
    expect(stream._writeln('b\n')).toBe(false);

    await handle.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('delivers unrecoverable write errors to an attached listener', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-badfd-'));
    const file = path.join(dir, 'events.jsonl');
    await fs.writeFile(file, '');
    const handle = await fs.open(file, 'r');
    const stream = new LogStream(handle.fd, { closeFd: false });

    const error = await new Promise<NodeJS.ErrnoException>(resolve => {
      stream.once('error', resolve);
      stream._writeln('a\n');
    });
    expect(error.code).toBe('EBADF');
    expect(stream.writable).toBe(false);

    await handle.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('completes a pending write before destroy closes the file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-destroy-'));
    const file = path.join(dir, 'events.jsonl');
    const stream = new LogStream(file);
    await once(stream, 'ready');

    stream.write('line\n');
    stream.destroy();
    await once(stream, 'close');

    expect(await fs.readFile(file, 'utf8')).toBe('line\n');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('resolves close when destroyed after a failed open', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-noopen-'));
    const blocker = path.join(dir, 'blocker');
    await fs.writeFile(blocker, '');
    const stream = new LogStream(path.join(blocker, 'events.jsonl'));

    stream.destroy();
    await once(stream, 'close');
    expect(stream.writable).toBe(false);

    await fs.rm(dir, { recursive: true, force: true });
  });

  it('can destroy borrowed fds without closing them', async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'event-log-borrowed-fd-')
    );
    const file = path.join(dir, 'events.jsonl');
    const handle = await fs.open(file, 'w+');
    const stream = new LogStream(handle.fd, { closeFd: false });
    stream.destroy();
    await once(stream, 'close');

    await handle.write('still-open\n');
    await handle.close();

    expect(await fs.readFile(file, 'utf8')).toBe('still-open\n');
    await fs.rm(dir, { recursive: true, force: true });
  });
});

function once(
  stream: { once(event: string, cb: () => void): void },
  event: string
) {
  return new Promise<void>(resolve => stream.once(event, resolve));
}

async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 20; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for condition');
}

function flush(stream: LogStream) {
  return new Promise<void>((resolve, reject) => {
    stream.flush(error => {
      if (error) reject(error);
      else resolve();
    });
  });
}
