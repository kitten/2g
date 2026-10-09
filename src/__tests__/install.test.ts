import fsSync, { closeSync, existsSync, openSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  EVENT_LOG_FORMAT,
  DEBUG_SEGMENTS,
  DEFAULT_SEGMENTS,
  DEFAULT_SEGMENT_SIZE,
  DEFAULT_RETAIN_MS,
  EVENT_LOG_TMP_DIR,
  INTERNAL_DEBUG_ENV,
  INTERNAL_IPC_ENV,
  INTERNAL_PROCESS_ORIGIN_ENV,
  LOG_DEBUG_ENV,
  LOG_EVENTS_ENV,
  SESSION_FILES,
} from '../constants';
import { _setSessionBaseDir, getSessionBaseDir } from '../discovery';
import { createSession } from '../session';
import { _resetEventLogState, eventLogState } from '../state';
import { openIpc } from '../utils/ipc';
import { LogStream } from '../utils/logStream';

describe('install session', () => {
  it.each(['EACCES', 'EBUSY'])(
    'continues logging and resumes rotation after removal fails with %s',
    async code => {
      const dir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'event-log-session-')
      );
      const restoreDir = setSessionDir(dir);
      const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
      const session = createSession({ maxSegments: 2, maxSegmentSize: 1 });
      const current = path.join(session.sessionDir, '0.jsonl');
      const oldest = path.join(session.sessionDir, '1.jsonl');
      const rmSync = fsSync.rmSync;
      const remove = vi
        .spyOn(fsSync, 'rmSync')
        .mockImplementation((file, options) => {
          if (file === oldest) throw Object.assign(new Error(code), { code });
          return rmSync(file, options);
        });
      const flush = () =>
        new Promise<void>((resolve, reject) =>
          session.sink.flush!(error => (error ? reject(error) : resolve()))
        );
      const first = '{"_e":"test:first","_t":1}\n';
      const second = '{"_e":"test:second","_t":2}\n';
      const third = '{"_e":"test:third","_t":3}\n';

      try {
        await fs.writeFile(oldest, 'old\n');
        session.sink._writeln(first);
        await flush();
        session.sink._writeln(second);
        await flush();
        expect(await fs.readFile(current, 'utf8')).toBe(first + second);
        expect(await fs.readFile(oldest, 'utf8')).toBe('old\n');
        expect(session.sink.writable).toBe(true);

        remove.mockRestore();
        session.sink._writeln(third);
        await flush();
        expect(await fs.readFile(oldest, 'utf8')).toBe(first + second + third);
        expect(await fs.readFile(current, 'utf8')).toBe('');
      } finally {
        remove.mockRestore();
        await new Promise<void>(resolve => session.sink.end(resolve));
        session.destroy();
        restoreDir();
        restoreIpc();
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  );

  it('retains the newest events when a burst rotates through the entire ring', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const session = createSession({
      maxSegments: DEFAULT_SEGMENTS,
      maxSegmentSize: DEFAULT_SEGMENT_SIZE,
    });

    try {
      const lines = Array.from({ length: 20_000 }, (_, index) =>
        JSON.stringify({
          _e: 'test:burst',
          _t: index,
          index,
          pad: 'x'.repeat(100),
        })
      );
      for (const line of lines) session.sink._writeln(`${line}\n`);
      await new Promise<void>((resolve, reject) =>
        session.sink.flush!(error => (error ? reject(error) : resolve()))
      );

      const segments = await Promise.all(
        Array.from({ length: DEFAULT_SEGMENTS }, (_, index) =>
          fs.readFile(path.join(session.sessionDir, `${index}.jsonl`), 'utf8')
        )
      );
      const retained = segments.reverse().join('').trim().split('\n');
      expect(retained.length).toBeGreaterThan(0);
      expect(retained.length).toBeLessThan(lines.length);
      expect(retained).toEqual(lines.slice(-retained.length));
      // A segment may overshoot by one write batch, but not by the whole burst.
      for (const segment of segments) {
        expect(Buffer.byteLength(segment)).toBeLessThanOrEqual(
          DEFAULT_SEGMENT_SIZE + 65_536 + lines[lines.length - 1].length + 1
        );
      }
    } finally {
      await new Promise<void>(resolve => session.sink.end(resolve));
      session.destroy();
      restoreDir();
      restoreIpc();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('creates session metadata before sockets are ready and forwards worker lines', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const session = createSession({
      command: 'test command',
      metadata: { version: '1.2.3' },
    });

    try {
      const meta = JSON.parse(
        await fs.readFile(
          path.join(session.sessionDir, SESSION_FILES.meta),
          'utf8'
        )
      );
      const pipeName = expect.stringMatching(/^\\\\\.\\pipe\\event-log-/);
      expect(meta).toMatchObject({
        command: 'test command',
        cwd: process.cwd(),
        maxSegments: 3,
        format: EVENT_LOG_FORMAT,
        metadata: { version: '1.2.3' },
        socket:
          process.platform === 'win32' ? pipeName : SESSION_FILES.liveSocket,
        ipcSocket:
          process.platform === 'win32' ? pipeName : SESSION_FILES.ipcSocket,
        origin: {
          argv: process.argv.slice(1),
          execPath: process.execPath,
          cwd: process.cwd(),
        },
      });

      session.sink._writeln(
        `${JSON.stringify({ _e: 'test:history', _t: Date.now() })}\n`
      );
      await new Promise<void>(resolve => session.sink.end(() => resolve()));
      expect(
        await fs.readFile(path.join(session.sessionDir, '0.jsonl'), 'utf8')
      ).toContain('"test:history"');
    } finally {
      session.destroy();
      await fs.rm(dir, { recursive: true, force: true });
      restoreDir();
      restoreIpc();
    }
  });

  it.skipIf(process.platform === 'win32')(
    'creates private session files on POSIX',
    async () => {
      const dir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'event-log-session-')
      );
      const baseDir = path.join(dir, 'sessions');
      await fs.mkdir(baseDir, { mode: 0o755 });
      const restoreDir = setSessionDir(baseDir);
      const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
      const session = createSession({ command: 'private' });

      try {
        session.sink._writeln(
          `${JSON.stringify({ _e: 'test:private', _t: Date.now() })}\n`
        );
        await new Promise<Error | null | undefined>(resolve =>
          session.sink.flush!(resolve)
        );

        expect((await fs.stat(session.sessionDir)).mode & 0o777).toBe(0o700);
        expect(
          (await fs.stat(path.join(session.sessionDir, SESSION_FILES.meta)))
            .mode & 0o777
        ).toBe(0o600);
        expect(
          (await fs.stat(path.join(session.sessionDir, '0.jsonl'))).mode & 0o777
        ).toBe(0o600);
      } finally {
        session.destroy();
        restoreDir();
        restoreIpc();
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  );

  it('creates collision-free session dirs that preserve prior sessions', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const first = createSession({ command: 'one' });

    try {
      first.sink._writeln(
        `${JSON.stringify({ _e: 'test:one', _t: Date.now() })}\n`
      );
      await new Promise<void>(resolve => first.sink.end(() => resolve()));

      const second = createSession({ command: 'two' });
      try {
        expect(path.basename(first.sessionDir)).toMatch(
          /^\d+-[0-9a-z]+-[0-9a-z]{6}$/
        );
        expect(second.sessionDir).not.toBe(first.sessionDir);
        expect(
          await fs.readFile(path.join(first.sessionDir, '0.jsonl'), 'utf8')
        ).toContain('"test:one"');
      } finally {
        second.destroy();
      }
    } finally {
      first.destroy();
      restoreDir();
      restoreIpc();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('flushes the session file stream through the composite sink', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const session = createSession({ command: 'flush' });

    try {
      session.sink._writeln(
        `${JSON.stringify({ _e: 'test:flush', _t: Date.now() })}\n`
      );
      await new Promise<Error | null | undefined>(resolve =>
        session.sink.flush!(resolve)
      );
      expect(
        await fs.readFile(path.join(session.sessionDir, '0.jsonl'), 'utf8')
      ).toContain('"test:flush"');
    } finally {
      session.destroy();
      restoreDir();
      restoreIpc();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('defers stale session cleanup off the install path', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const staleDir = path.join(dir, '9999999');
    await fs.mkdir(staleDir, { recursive: true });
    await fs.writeFile(
      path.join(staleDir, SESSION_FILES.meta),
      JSON.stringify({
        pid: 9_999_999,
        format: EVENT_LOG_FORMAT,
        metadata: {},
        startedAt: Date.now() - DEFAULT_RETAIN_MS - 1_000,
        command: 'stale',
        cwd: process.cwd(),
        maxSegments: 3,
        socket: SESSION_FILES.liveSocket,
        ipcSocket: SESSION_FILES.ipcSocket,
      })
    );
    const session = createSession({ command: 'fresh' });

    try {
      // Synchronous check: the deferred cleanup runs on a setImmediate, so it
      // cannot have fired before this same event-loop turn yields. Awaiting an
      // async exists() here would race the cleanup's synchronous rmSync.
      expect(existsSync(staleDir)).toBe(true);
      await waitFor(async () => !(await exists(staleDir)));
    } finally {
      session.destroy();
      restoreIpc();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('uses a system tmpdir parent by default', () => {
    const restoreDir = setSessionDir(undefined);
    try {
      expect(getSessionBaseDir()).toBe(EVENT_LOG_TMP_DIR);
    } finally {
      restoreDir();
    }
  });

  it('prints matching LOG_DEBUG events through the parent session sink', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    const restoreDebug = setEnv(LOG_DEBUG_ENV, 'metro:*');
    const restoreEvents = setEnv(LOG_EVENTS_ENV, 'unused.jsonl');
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const restoreDebugIpc = setEnv(INTERNAL_DEBUG_ENV, undefined);
    const restoreOrigin = setEnv(INTERNAL_PROCESS_ORIGIN_ENV, undefined);
    const previousDebug = eventLogState.debug;
    eventLogState.debug = true;
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const session = createSession({ command: 'debug' });

    try {
      const ipcPath = process.env[INTERNAL_IPC_ENV];
      expect(ipcPath).toBeTruthy();
      expect(process.env[INTERNAL_DEBUG_ENV]).toBe('1');
      expect(process.env[INTERNAL_PROCESS_ORIGIN_ENV]).toBe(
        String(process.pid)
      );
      expect(process.env[LOG_EVENTS_ENV]).toBeUndefined();
      expect(process.env[LOG_DEBUG_ENV]).toBeUndefined();
      session.sink._writeln(
        `${JSON.stringify({ _e: 'metro:done', _t: Date.now(), _d: 1534 })}\n`
      );
      session.sink._writeln(
        `${JSON.stringify({ _e: 'env:info', _t: Date.now() })}\n`
      );
      session.sink._writeln(
        `${JSON.stringify({
          _e: 'metro:worker',
          _t: Date.now(),
          _w: 'worker_thread:1',
          file: 'App.tsx',
        })}\n`
      );

      const output = write.mock.calls.map(call => String(call[0])).join('');
      expect(output).toMatch(
        /\d{4}-\d{2}-\d{2}T.* metro:done 1\.53s \{"_e":"metro:done"/
      );
      expect(output).toContain('metro:worker {"_e":"metro:worker"');
      expect(output).toContain('"_w":"worker_thread:1"');
      expect(output).toContain('"file":"App.tsx"');
      expect(output).not.toContain('env:info');

      session.sink.destroy();
      expect(process.env[INTERNAL_IPC_ENV]).toBe(ipcPath);
      expect(process.env[INTERNAL_DEBUG_ENV]).toBe('1');
      expect(process.env[INTERNAL_PROCESS_ORIGIN_ENV]).toBe(
        String(process.pid)
      );

      session.destroy();
      expect(process.env[INTERNAL_IPC_ENV]).toBeUndefined();
      expect(process.env[INTERNAL_DEBUG_ENV]).toBeUndefined();
      expect(process.env[INTERNAL_PROCESS_ORIGIN_ENV]).toBeUndefined();
      expect(process.env[LOG_EVENTS_ENV]).toBeUndefined();
      expect(process.env[LOG_DEBUG_ENV]).toBeUndefined();
    } finally {
      write.mockRestore();
      session.destroy();
      eventLogState.debug = previousDebug;
      restoreDebug();
      restoreEvents();
      restoreIpc();
      restoreDebugIpc();
      restoreOrigin();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('install explicit file target', () => {
  it.each([false, true])(
    'handles an unavailable working directory (fallback target: %s)',
    async fallback => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-cwd-'));
      const file = path.join(dir, 'events.jsonl');
      const restoreEvents = setEnv(LOG_EVENTS_ENV, 'events.jsonl');
      const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);

      try {
        vi.resetModules();
        const { installEventLogger, getEventLoggerInfo, flushEventLogger } =
          await import('../install');
        const cwd = vi.spyOn(process, 'cwd').mockImplementation(() => {
          throw Object.assign(new Error('cwd unavailable'), { code: 'ENOENT' });
        });
        try {
          installEventLogger(fallback ? file : undefined);
        } finally {
          cwd.mockRestore();
        }
        if (fallback) {
          expect(getEventLoggerInfo()).toMatchObject({
            destination: 'file',
            file,
          });
          await flushEventLogger();
          expect(await fs.readFile(file, 'utf8')).toContain('"root:init"');
        } else {
          expect(getEventLoggerInfo()).toBeNull();
        }
      } finally {
        _resetEventLogState();
        restoreEvents();
        restoreIpc();
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  );

  it.each([
    ['file', '1.2.3'],
    ['fd', '1.2.3'],
    ['file', undefined],
    ['fd', undefined],
  ] as const)(
    'preserves version %s/%s across repeated installation',
    async (target, version) => {
      const dir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'event-log-version-')
      );
      const file = path.join(dir, 'events.jsonl');
      const fd = target === 'fd' ? openSync(file, 'w') : undefined;
      const restoreEvents = setEnv(LOG_EVENTS_ENV, String(fd ?? file));
      const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);

      try {
        vi.resetModules();
        const { installEventLogger, flushEventLogger } =
          await import('../install');
        installEventLogger(
          version == null ? undefined : { metadata: { version } }
        );
        installEventLogger({ metadata: { version: '9.9.9' } });
        await flushEventLogger();
        const lines = (await fs.readFile(file, 'utf8'))
          .trim()
          .split('\n')
          .map(line => JSON.parse(line));
        expect(lines).toEqual([
          expect.objectContaining({
            _e: 'root:init',
          }),
        ]);
        expect(lines[0].version).toBe(version);
        expect(lines[0]).not.toHaveProperty('metadata');
      } finally {
        const sink = eventLogState.primarySink as LogStream | undefined;
        const closed =
          sink && new Promise<void>(resolve => sink.once('close', resolve));
        _resetEventLogState();
        await closed;
        if (!sink && fd != null) closeSync(fd);
        restoreEvents();
        restoreIpc();
        vi.resetModules();
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  );

  it('tags worker events with a worker id when logging to a file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-file-'));
    const file = path.join(dir, 'events.jsonl');
    const restoreEvents = setEnv(LOG_EVENTS_ENV, file);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    vi.doMock('../utils/processOrigin', async importOriginal => ({
      ...(await importOriginal<typeof import('../utils/processOrigin')>()),
      getProcessWorkerId: () => 'worker_thread:7',
    }));

    try {
      vi.resetModules();
      const { installEventLogger, events, flushEventLogger } =
        await import('../index');
      installEventLogger();
      events('custom')('ping', {});
      await flushEventLogger();

      const lines = (await fs.readFile(file, 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      const ping = lines.find(line => line._e === 'custom:ping');
      expect(ping._w).toBe('worker_thread:7');
    } finally {
      restoreEvents();
      restoreIpc();
      vi.doUnmock('../utils/processOrigin');
      vi.resetModules();
      _resetEventLogState();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('omits the worker id for the main process', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-file-'));
    const file = path.join(dir, 'events.jsonl');
    const restoreEvents = setEnv(LOG_EVENTS_ENV, file);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    vi.doMock('../utils/processOrigin', async importOriginal => ({
      ...(await importOriginal<typeof import('../utils/processOrigin')>()),
      getProcessWorkerId: () => undefined,
    }));

    try {
      vi.resetModules();
      const { installEventLogger, events, flushEventLogger } =
        await import('../index');
      installEventLogger();
      events('custom')('ping', {});
      await flushEventLogger();

      const lines = (await fs.readFile(file, 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      const ping = lines.find(line => line._e === 'custom:ping');
      expect(ping._w).toBeUndefined();
    } finally {
      restoreEvents();
      restoreIpc();
      vi.doUnmock('../utils/processOrigin');
      vi.resetModules();
      _resetEventLogState();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('is idempotent: a second install keeps the first target', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-file-'));
    const fileA = path.join(dir, 'a.jsonl');
    const fileB = path.join(dir, 'b.jsonl');
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const restoreEvents = setEnv(LOG_EVENTS_ENV, undefined);

    try {
      vi.resetModules();
      const { installEventLogger, getEventLoggerInfo } =
        await import('../install');
      installEventLogger(fileA);
      // A second install must not re-open a different target.
      installEventLogger(fileB);
      expect(getEventLoggerInfo()).toMatchObject({
        destination: 'file',
        file: fileA,
      });
      expect(await exists(fileB)).toBe(false);
    } finally {
      restoreEvents();
      restoreIpc();
      vi.resetModules();
      _resetEventLogState();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('publishes an IPC path for child writes with an explicit target', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-file-'));
    const file = path.join(dir, 'events.jsonl');
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const restoreOrigin = setEnv(INTERNAL_PROCESS_ORIGIN_ENV, undefined);
    const restoreDebugIpc = setEnv(INTERNAL_DEBUG_ENV, undefined);
    const restoreDebug = setEnv(LOG_DEBUG_ENV, '*');
    const restoreEvents = setEnv(LOG_EVENTS_ENV, file);
    let childStream: LogStream | undefined;

    try {
      vi.resetModules();
      const { installEventLogger } = await import('../install');
      installEventLogger(file);

      const ipcPath = process.env[INTERNAL_IPC_ENV];
      expect(ipcPath).toBeTruthy();
      expect(process.env[INTERNAL_PROCESS_ORIGIN_ENV]).toBe(
        String(process.pid)
      );
      const { getProcessOrigin } = await import('../utils/processOrigin');
      expect(getProcessOrigin()).toBeNull();
      if (process.platform !== 'win32') expect(ipcPath).not.toContain(dir);
      expect(process.env[LOG_DEBUG_ENV]).toBeUndefined();
      expect(process.env[LOG_EVENTS_ENV]).toBeUndefined();
      expect(process.env[INTERNAL_DEBUG_ENV]).toBe('1');

      childStream = new LogStream(openIpc(ipcPath!), { closeFd: false });
      childStream._writeln(
        `${JSON.stringify({ _e: 'child:explicit', _t: Date.now() })}\n`
      );
      await new Promise<Error | null | undefined>(resolve =>
        childStream!.flush!(resolve)
      );

      await waitFor(async () => {
        try {
          return (await fs.readFile(file, 'utf8')).includes('child:explicit');
        } catch {
          return false;
        }
      });
      _resetEventLogState();
      expect(process.env[INTERNAL_PROCESS_ORIGIN_ENV]).toBeUndefined();
      expect(process.env[INTERNAL_IPC_ENV]).toBeUndefined();
      expect(process.env[INTERNAL_DEBUG_ENV]).toBeUndefined();
      expect(getProcessOrigin()).toBeNull();
    } finally {
      childStream?.destroy();
      vi.resetModules();
      _resetEventLogState();
      restoreDebug();
      restoreDebugIpc();
      restoreEvents();
      restoreIpc();
      restoreOrigin();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('install auto-connect', () => {
  it('auto-connects to a parent session on import and pipes events to it', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-child-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    // createSession publishes __eventLogIpc, mimicking a spawned child's env.
    const session = createSession({ command: 'parent' });

    try {
      vi.resetModules();
      // Importing the library auto-connects because __eventLogIpc is present.
      const {
        installChildEventLogger,
        installEventLogger,
        getEventLoggerInfo,
        events,
        flushEventLogger,
      } = await import('../index');
      expect(getEventLoggerInfo()?.destination).toBe('ipc');

      // A repeat call is a no-op: it reports the active logger without reconnecting.
      expect(installChildEventLogger()).toBe(true);
      expect(getEventLoggerInfo()?.destination).toBe('ipc');

      const info = getEventLoggerInfo();
      const sink = eventLogState.primarySink;
      installEventLogger({ debug: !info?.debug });
      expect(getEventLoggerInfo()).toBe(info);
      expect(eventLogState.primarySink).toBe(sink);
      expect(eventLogState.debug).toBe(info?.debug);

      events('custom')('ping', {});
      await flushEventLogger();
      await waitFor(async () =>
        (
          await fs.readFile(path.join(session.sessionDir, '0.jsonl'), 'utf8')
        ).includes('custom:ping')
      );
    } finally {
      session.destroy();
      vi.resetModules();
      _resetEventLogState();
      restoreIpc();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('prefers a parent session over an inherited explicit file target', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-child-'));
    const fileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-file-'));
    const file = path.join(fileDir, 'events.jsonl');
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const session = createSession({ command: 'parent' });
    const restoreEvents = setEnv(LOG_EVENTS_ENV, file);

    try {
      vi.resetModules();
      // Import from '../install' (not '../index') to exercise installEventLogger's
      // own precedence rather than the on-import auto-connect side effect.
      const { installEventLogger, getEventLoggerInfo } =
        await import('../install');
      installEventLogger();
      expect(getEventLoggerInfo()?.destination).toBe('ipc');
      expect(await exists(file)).toBe(false);
    } finally {
      session.destroy();
      vi.resetModules();
      _resetEventLogState();
      restoreEvents();
      restoreIpc();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
      await fs.rm(fileDir, { recursive: true, force: true });
    }
  });

  it('retains a larger segment ring buffer in debug mode', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-session-'));
    const restoreDir = setSessionDir(dir);
    eventLogState.debug = true;
    const session = createSession({ command: 'debug segments' });

    try {
      const meta = JSON.parse(
        await fs.readFile(
          path.join(session.sessionDir, SESSION_FILES.meta),
          'utf8'
        )
      );
      expect(meta.maxSegments).toBe(DEBUG_SEGMENTS);
    } finally {
      session.destroy();
      _resetEventLogState();
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('does nothing without a parent, and a later installEventLogger still works', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-file-'));
    const file = path.join(dir, 'events.jsonl');
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const restoreEvents = setEnv(LOG_EVENTS_ENV, undefined);

    try {
      vi.resetModules();
      const {
        installChildEventLogger,
        installEventLogger,
        getEventLoggerInfo,
      } = await import('../index');
      // The on-import auto-connect was a no-op with no parent.
      expect(installChildEventLogger()).toBe(false);
      installEventLogger();
      expect(getEventLoggerInfo()).toBeNull();

      // A subsequent explicit install still proceeds normally.
      installEventLogger(file);
      expect(getEventLoggerInfo()?.destination).toBe('file');
    } finally {
      vi.resetModules();
      _resetEventLogState();
      restoreEvents();
      restoreIpc();
      restoreDir();
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

function setSessionDir(dir: string | undefined) {
  _setSessionBaseDir(dir);
  return () => _setSessionBaseDir(undefined);
}

async function exists(file: string) {
  try {
    await fs.stat(file);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 40; i++) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for condition');
}
