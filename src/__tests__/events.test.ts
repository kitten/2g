import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  INTERNAL_IPC_ENV,
  INTERNAL_DEBUG_ENV,
  INTERNAL_PROCESS_ORIGIN_ENV,
  LOG_DEBUG_ENV,
  LOG_EVENTS_ENV,
  SESSION_FILES,
} from '../constants';
import { _setSessionBaseDir } from '../clean';
import { _resetEventLogState, eventLogState } from '../state';

describe('api', () => {
  afterEach(() => {
    _resetEventLogState();
  });

  it('logs through shared global state after module reloads', async () => {
    const lines: string[] = [];
    eventLogState.primarySink = {
      writable: true,
      _writeln(line) {
        lines.push(line);
        return true;
      },
      end() {
        return this;
      },
      destroy() {},
    };
    vi.resetModules();

    const { events } = await import('../events');
    events('root')('init', {
      format: 'v0-jsonl',
      formatVersion: 1,
      version: 'test',
    });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      _e: 'root:init',
      version: 'test',
    });
  });

  it('writes debug events with _l through events.debug', async () => {
    const lines: string[] = [];
    const { events } = await import('../events');
    const debug = events.debug('custom');
    debug('probe', { hit: true });
    expect(lines).toHaveLength(0);

    eventLogState.primarySink = {
      writable: true,
      _writeln(line) {
        lines.push(line);
        return true;
      },
      end() {
        return this;
      },
      destroy() {},
    };

    debug('probe', { hit: true });
    debug.span()('op', { ok: true });
    expect(lines).toHaveLength(0);

    eventLogState.debug = true;
    debug('probe', { hit: true });
    const end = debug.span();
    end('op', { ok: true });
    events('custom')('ready');

    expect(JSON.parse(lines[0])).toMatchObject({
      _e: 'custom:probe',
      _l: 1,
      hit: true,
    });
    const span = JSON.parse(lines[1]);
    expect(span).toMatchObject({ _e: 'custom:op', _l: 1, ok: true });
    expect(typeof span._d).toBe('number');
    expect(Object.keys(JSON.parse(lines[2]))).toEqual(['_e', '_t']);
  });

  it('flushes buffered events and reports the destination info', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-flush-'));
    const logFile = path.join(dir, 'events.jsonl');
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const restoreLog = setEnv(LOG_EVENTS_ENV, logFile);
    vi.resetModules();

    try {
      const { installEventLogger, flushEventLogger, getEventLoggerInfo } =
        await import('../install');
      const { events } = await import('../events');
      installEventLogger();
      events('custom')('tick', { n: 1 });
      events.debug('custom')('verbose', { n: 2 });
      await flushEventLogger();
      const output = await fs.readFile(logFile, 'utf8');
      expect(output).toContain('"custom:tick"');
      expect(output).toContain('"custom:verbose"');
      expect(getEventLoggerInfo()).toMatchObject({
        destination: 'file',
        debug: true,
      });
    } finally {
      restoreIpc();
      restoreLog();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('skips session capture with session: false', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const restoreLog = setEnv(LOG_EVENTS_ENV, undefined);
    vi.resetModules();

    try {
      const { installEventLogger, getEventLoggerInfo } =
        await import('../install');
      installEventLogger({ command: 'off', session: false });
      expect(getEventLoggerInfo()).toBeNull();
      expect(await fs.readdir(dir)).toEqual([]);
    } finally {
      restoreDir();
      restoreIpc();
      restoreLog();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('omits debug events on the session path by default', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const restoreLog = setEnv(LOG_EVENTS_ENV, undefined);
    const restoreDebug = setEnv(LOG_DEBUG_ENV, undefined);
    vi.resetModules();

    try {
      const { installEventLogger, flushEventLogger, getEventLoggerInfo } =
        await import('../install');
      const { events } = await import('../events');
      installEventLogger({ command: 'session' });
      events.debug('custom')('verbose', { n: 1 });
      events('custom')('tick', { n: 2 });
      await flushEventLogger();
      const info = getEventLoggerInfo();
      expect(info).toMatchObject({ debug: false });
      const sessionDir =
        info?.destination === 'session' ? info.sessionDir : undefined;
      const output = await fs.readFile(
        path.join(sessionDir!, '0.jsonl'),
        'utf8'
      );
      expect(output).toContain('"custom:tick"');
      expect(output).not.toContain('"custom:verbose"');
    } finally {
      restoreDir();
      restoreIpc();
      restoreLog();
      restoreDebug();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('records session debug events when LOG_DEBUG is set', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const restoreLog = setEnv(LOG_EVENTS_ENV, undefined);
    const restoreDebug = setEnv(LOG_DEBUG_ENV, 'unrelated:*');
    vi.resetModules();

    try {
      const { installEventLogger, flushEventLogger, getEventLoggerInfo } =
        await import('../install');
      const { events } = await import('../events');
      installEventLogger({ command: 'session' });
      events.debug('custom')('verbose', { n: 1 });
      await flushEventLogger();
      const info = getEventLoggerInfo();
      expect(info).toMatchObject({ debug: true });
      const sessionDir =
        info?.destination === 'session' ? info.sessionDir : undefined;
      expect(
        await fs.readFile(path.join(sessionDir!, '0.jsonl'), 'utf8')
      ).toContain('"custom:verbose"');
    } finally {
      restoreDir();
      restoreIpc();
      restoreLog();
      restoreDebug();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('records session debug events with debug: true', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const restoreLog = setEnv(LOG_EVENTS_ENV, undefined);
    const restoreDebug = setEnv(LOG_DEBUG_ENV, undefined);
    vi.resetModules();

    try {
      const { installEventLogger, flushEventLogger, getEventLoggerInfo } =
        await import('../install');
      const { events } = await import('../events');
      installEventLogger({ command: 'session', debug: true });
      events.debug('custom')('verbose', { n: 1 });
      await flushEventLogger();
      const info = getEventLoggerInfo();
      expect(info).toMatchObject({ debug: true });
      const sessionDir =
        info?.destination === 'session' ? info.sessionDir : undefined;
      expect(
        await fs.readFile(path.join(sessionDir!, '0.jsonl'), 'utf8')
      ).toContain('"custom:verbose"');
    } finally {
      restoreDir();
      restoreIpc();
      restoreLog();
      restoreDebug();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('resolves flushEventLogger immediately with no active sink', async () => {
    const { flushEventLogger } = await import('../install');
    await flushEventLogger();
  });

  it('installs a file logger and emits root:init', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-api-'));
    const logFile = path.join(dir, 'events.jsonl');
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const restoreLog = setEnv(LOG_EVENTS_ENV, logFile);
    vi.resetModules();

    try {
      const { installEventLogger, getEventLoggerInfo } =
        await import('../install');
      installEventLogger();
      const info = getEventLoggerInfo();
      expect(info).toMatchObject({
        destination: 'file',
        isUserVisibleOutput: false,
        file: logFile,
      });
      await waitFor(async () => {
        try {
          return (await fs.readFile(logFile, 'utf8')).includes('"root:init"');
        } catch {
          return false;
        }
      });
      expect(
        JSON.parse((await fs.readFile(logFile, 'utf8')).trim())
      ).toMatchObject({
        _e: 'root:init',
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
      restoreIpc();
      restoreLog();
    }
  });

  it('keeps path helper output relative to the log target directory', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-path-'));
    const logFile = path.join(dir, 'events.jsonl');
    const restoreLog = setEnv(LOG_EVENTS_ENV, logFile);
    vi.resetModules();

    try {
      const { events } = await import('../events');
      const { installEventLogger } = await import('../install');
      installEventLogger();
      await waitFor(async () => {
        try {
          await fs.stat(logFile);
          return true;
        } catch {
          return false;
        }
      });
      expect(
        JSON.parse(
          JSON.stringify(events('root').path(path.join(dir, 'src', 'App.tsx')))
        )
      ).toBe('src/App.tsx');
    } finally {
      restoreLog();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('serializes errors with cause chains through the error helper', async () => {
    const { events } = await import('../events');
    const log = events('custom');
    const json = (value: unknown) => JSON.parse(JSON.stringify(value));

    const error = new Error('outer', { cause: new TypeError('root') });
    expect(json(log.error(error))).toEqual({
      name: 'Error',
      message: 'outer',
      stack: expect.any(String),
      cause: {
        name: 'TypeError',
        message: 'root',
        stack: expect.any(String),
      },
    });

    expect(
      json(log.error(new Error('plain', { cause: 'disk full' })))
    ).toMatchObject({ message: 'plain', cause: 'disk full' });

    const errno: NodeJS.ErrnoException = new Error('no such file');
    errno.code = 'ENOENT';
    expect(json(log.error(errno))).toMatchObject({
      message: 'no such file',
      code: 'ENOENT',
    });
    expect(json(log.error('boom'))).toBe('boom');
    expect(json(log.error(null))).toBe(null);

    const cyclic = new Error('cyclic');
    cyclic.cause = cyclic;
    expect(() => JSON.stringify(log.error(cyclic))).not.toThrow();
  });

  it('defers helper serialization until an event is written', async () => {
    const lines: string[] = [];
    const { events } = await import('../events');
    const log = events('custom');

    let serialized = 0;
    const error = new Error('late');
    Object.defineProperty(error, 'stack', {
      get: () => {
        serialized++;
        return 'stack';
      },
    });

    const wrapped = log.error(error);
    log('failed', { error: wrapped });
    expect(serialized).toBe(0);

    eventLogState.primarySink = {
      writable: true,
      _writeln(line) {
        lines.push(line);
        return true;
      },
      end() {
        return this;
      },
      destroy() {},
    };
    log('failed', { error: wrapped, file: log.path(process.cwd()) });
    expect(serialized).toBe(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      _e: 'custom:failed',
      error: { name: 'Error', message: 'late', stack: 'stack' },
      file: '.',
    });
  });

  it('reports whether explicit event output is user-visible', async () => {
    const restoreLog = setEnv(LOG_EVENTS_ENV, '1');
    vi.resetModules();
    vi.doMock('../utils/logStream', async importOriginal => {
      const actual =
        await importOriginal<typeof import('../utils/logStream')>();
      class MockLogStream {
        writable = true;
        file = null;
        once(_event: string, cb: () => void) {
          queueMicrotask(cb);
        }
        _writeln() {
          return true;
        }
        end() {
          return this;
        }
        destroy() {}
      }
      return { ...actual, LogStream: MockLogStream };
    });

    try {
      const { installEventLogger, getEventLoggerInfo } =
        await import('../install');
      installEventLogger();
      const info = getEventLoggerInfo();
      expect(info).toMatchObject({
        destination: 'stdout',
        isUserVisibleOutput: true,
        fd: 1,
      });
      expect(getEventLoggerInfo()).toBe(info);
    } finally {
      vi.doUnmock('../utils/logStream');
      restoreLog();
    }
  });

  it('deactivates when the explicit LOG_EVENTS target fails', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-dead-'));
    const blocker = path.join(dir, 'blocker');
    await fs.writeFile(blocker, '');
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const restoreLog = setEnv(
      LOG_EVENTS_ENV,
      path.join(blocker, 'events.jsonl')
    );
    vi.resetModules();

    try {
      const { installEventLogger, getEventLoggerInfo } =
        await import('../install');
      const { events } = await import('../events');
      installEventLogger();
      events('custom')('tick', {});
      await waitFor(() => getEventLoggerInfo() === null);
      const { eventLogState } = await import('../state');
      expect(eventLogState.primarySink).toBeUndefined();
    } finally {
      restoreIpc();
      restoreLog();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('connects to parent IPC and emits inherited child root:init', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-worker-'));
    const socketPath = testSocketPath(dir, SESSION_FILES.ipcSocket);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, socketPath);
    const restoreLog = setEnv(LOG_EVENTS_ENV, undefined);
    const restoreOrigin = setEnv(INTERNAL_PROCESS_ORIGIN_ENV, 'parent-7');
    const received: string[] = [];
    let client: net.Socket | undefined;
    const server = net.createServer(socket => {
      client = socket;
      socket.on('data', chunk => received.push(chunk.toString('utf8')));
    });
    await new Promise<void>(resolve => server.listen(socketPath, resolve));
    vi.resetModules();

    try {
      const { installEventLogger } = await import('../install');
      installEventLogger();
      await waitFor(() => received.join('').includes('"root:init"'));
      expect(JSON.parse(received.join('').trim())).toMatchObject({
        _e: 'root:init',
        _w: `event_log_child:${process.pid}`,
        processOrigin: { kind: 'event_log_child', id: String(process.pid) },
      });
    } finally {
      client?.destroy();
      server.close();
      restoreIpc();
      restoreLog();
      restoreOrigin();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('prefers inherited parent IPC over inherited LOG_DEBUG output', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-worker-'));
    const socketPath = testSocketPath(dir, SESSION_FILES.ipcSocket);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, socketPath);
    const restoreDebug = setEnv(LOG_DEBUG_ENV, '*');
    const restoreLog = setEnv(LOG_EVENTS_ENV, undefined);
    const restoreOrigin = setEnv(INTERNAL_PROCESS_ORIGIN_ENV, 'parent-8');
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const received: string[] = [];
    let client: net.Socket | undefined;
    const server = net.createServer(socket => {
      client = socket;
      socket.on('data', chunk => received.push(chunk.toString('utf8')));
    });
    await new Promise<void>(resolve => server.listen(socketPath, resolve));
    vi.resetModules();

    try {
      const { installEventLogger, getEventLoggerInfo } =
        await import('../install');
      installEventLogger();
      expect(getEventLoggerInfo()).toMatchObject({
        destination: 'ipc',
        debug: true,
      });
      await waitFor(() => received.join('').includes('"root:init"'));
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
      client?.destroy();
      server.close();
      restoreIpc();
      restoreDebug();
      restoreLog();
      restoreOrigin();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('enables debug events from an inherited parent IPC debug flag', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-worker-'));
    const socketPath = testSocketPath(dir, SESSION_FILES.ipcSocket);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, socketPath);
    const restoreDebug = setEnv(INTERNAL_DEBUG_ENV, '1');
    const restoreLog = setEnv(LOG_EVENTS_ENV, undefined);
    const received: string[] = [];
    let client: net.Socket | undefined;
    const server = net.createServer(socket => {
      client = socket;
      socket.on('data', chunk => received.push(chunk.toString('utf8')));
    });
    await new Promise<void>(resolve => server.listen(socketPath, resolve));
    vi.resetModules();

    try {
      const { installEventLogger } = await import('../install');
      const { events, flushEventLogger } = await import('../index');
      installEventLogger();
      events.debug('custom')('verbose', {});
      await flushEventLogger();
      await waitFor(() => received.join('').includes('"custom:verbose"'));
    } finally {
      client?.destroy();
      server.close();
      restoreIpc();
      restoreDebug();
      restoreLog();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('does not classify the originating process as its own child', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-parent-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const restoreLog = setEnv(LOG_EVENTS_ENV, undefined);
    vi.resetModules();

    try {
      const { installEventLogger, getEventLoggerInfo } =
        await import('../install');
      installEventLogger({ command: 'parent' });
      const info = getEventLoggerInfo();
      const sessionDir =
        info?.destination === 'session' ? info.sessionDir : undefined;
      expect(sessionDir).toBeTruthy();
      const logFile = path.join(sessionDir!, '0.jsonl');
      await waitFor(async () => {
        try {
          return (await fs.readFile(logFile, 'utf8')).includes('"root:init"');
        } catch {
          return false;
        }
      });
      const event = JSON.parse((await fs.readFile(logFile, 'utf8')).trim());
      expect(event).toMatchObject({ _e: 'root:init' });
      expect(event).not.toHaveProperty('_w');
      expect(event).not.toHaveProperty('processOrigin');
    } finally {
      restoreDir();
      restoreIpc();
      restoreLog();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('detects node child process identity for parent IPC events', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-child-'));
    const socketPath = testSocketPath(dir, SESSION_FILES.ipcSocket);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, socketPath);
    const restoreLog = setEnv(LOG_EVENTS_ENV, undefined);
    const restoreNodeUnique = setEnv('NODE_UNIQUE_ID', '42');
    const restoreOrigin = setEnv(INTERNAL_PROCESS_ORIGIN_ENV, undefined);
    const received: string[] = [];
    let client: net.Socket | undefined;
    const server = net.createServer(socket => {
      client = socket;
      socket.on('data', chunk => received.push(chunk.toString('utf8')));
    });
    await new Promise<void>(resolve => server.listen(socketPath, resolve));
    vi.resetModules();

    try {
      const { installEventLogger } = await import('../install');
      installEventLogger();
      await waitFor(() => received.join('').includes('"root:init"'));
      expect(JSON.parse(received.join('').trim())).toMatchObject({
        _w: 'child_process:42',
        processOrigin: { kind: 'child_process', id: '42' },
      });
    } finally {
      client?.destroy();
      server.close();
      restoreIpc();
      restoreLog();
      restoreNodeUnique();
      restoreOrigin();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

function setEnv(name: string, value: string | undefined) {
  const previous = process.env[name];
  if (value == null) delete process.env[name];
  else process.env[name] = value;
  return () => {
    if (previous == null) delete process.env[name];
    else process.env[name] = previous;
  };
}

let socketCount = 0;

// Windows net servers cannot listen on filesystem paths
function testSocketPath(dir: string, name: string) {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\event-log-test-${process.pid}-${socketCount++}-${name}`
    : path.join(dir, name);
}

function setSessionDir(dir: string) {
  _setSessionBaseDir(dir);
  return () => _setSessionBaseDir(undefined);
}

async function waitFor(predicate: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 80; i++) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for condition');
}
