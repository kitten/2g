import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LogStream } from '../logStream';

describe('logStream', () => {
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
