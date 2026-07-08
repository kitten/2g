import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EVENT_LOG_FORMAT_VERSION,
  INTERNAL_IPC_ENV,
  SESSION_FILES,
} from '../constants';
import { _setSessionBaseDir } from '../clean';
import { createSession } from '../session';
import { listSessions, resolveSession, tap } from '../tap';
import { parseEventLine, parseSince } from '../utils/eventFilter';
import type { ParsedEvent } from '../types';

describe('tap', () => {
  it('discovers sessions, replays filtered history, follows live events, and preserves duplicates', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-tap-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const session = createSession({
      command: 'test command',
      version: '1.2.3',
    });

    try {
      const discovered = await listSessions();
      expect(discovered[0]).toMatchObject({
        command: 'test command',
        formatVersion: EVENT_LOG_FORMAT_VERSION,
        version: '1.2.3',
        origin: {
          argv: process.argv.slice(1),
          cwd: process.cwd(),
        },
      });

      session.sink._writeln(
        `${JSON.stringify({ _e: 'test:history', _t: Date.now() })}\n`
      );
      await new Promise<void>(resolve => session.sink.end(() => resolve()));

      const history: string[] = [];
      for await (const event of tap(session.sessionDir, { filter: ['test'] })) {
        history.push(event._e);
      }
      expect(history).toEqual(['test:history']);

      const liveSession = createSession({ command: 'live' });
      const iterator = tap(liveSession.sessionDir, {
        follow: true,
      })[Symbol.asyncIterator]();
      const liveNext = iterator.next();
      await new Promise(resolve => setTimeout(resolve, 100));
      liveSession.sink._writeln(
        `${JSON.stringify({ _e: 'test:live', _t: Date.now() })}\n`
      );
      const next = await Promise.race([
        liveNext,
        new Promise<IteratorResult<unknown>>(resolve =>
          setTimeout(() => resolve({ done: true, value: undefined }), 3000)
        ),
      ]);
      expect(next.done).toBe(false);
      expect(next.value).toMatchObject({ _e: 'test:live' });

      const duplicateLine = JSON.stringify({
        _e: 'test:duplicate',
        _t: Date.now(),
        same: true,
      });
      liveSession.sink._writeln(`${duplicateLine}\n`);
      liveSession.sink._writeln(`${duplicateLine}\n`);
      const firstDuplicate = await iterator.next();
      const secondDuplicate = await iterator.next();
      expect(firstDuplicate.value).toMatchObject({ _e: 'test:duplicate' });
      expect(secondDuplicate.value).toMatchObject({ _e: 'test:duplicate' });
      liveSession.destroy();
    } finally {
      session.destroy();
      await fs.rm(dir, { recursive: true, force: true });
      restoreDir();
      restoreIpc();
    }
  });

  it('follows the live socket recorded in session metadata', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-tap-'));
    const sessionDir = path.join(dir, 'custom');
    await fs.mkdir(sessionDir, { recursive: true });
    const socketName =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\event-log-test-${process.pid}-custom`
        : 'custom.sock';
    const socketPath =
      process.platform === 'win32'
        ? socketName
        : path.join(sessionDir, socketName);
    await fs.writeFile(
      path.join(sessionDir, SESSION_FILES.meta),
      JSON.stringify({
        pid: process.pid,
        formatVersion: EVENT_LOG_FORMAT_VERSION,
        startedAt: Date.now(),
        command: 'custom-socket',
        cwd: process.cwd(),
        maxSegments: 3,
        socket: socketName,
        ipcSocket: SESSION_FILES.ipcSocket,
      })
    );
    let client: net.Socket | undefined;
    const server = net.createServer(socket => {
      client = socket;
      socket.write(`${JSON.stringify({ _e: 'test:live', _t: Date.now() })}\n`);
    });
    await new Promise<void>(resolve => server.listen(socketPath, resolve));

    try {
      const iterator = tap(sessionDir, { follow: true })[
        Symbol.asyncIterator
      ]();
      const next = await Promise.race([
        iterator.next(),
        new Promise<IteratorResult<ParsedEvent>>(resolve =>
          setTimeout(() => resolve({ done: true, value: undefined }), 2000)
        ),
      ]);
      expect(next.done).toBe(false);
      expect(next.value).toMatchObject({ _e: 'test:live' });
    } finally {
      client?.destroy();
      server.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('replays the number of history segments recorded in metadata', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-tap-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const session = createSession({
      command: 'segments',
      maxSegments: 5,
    });

    try {
      for (let i = 0; i < 5; i++) {
        await fs.writeFile(
          path.join(session.sessionDir, `${i}.jsonl`),
          `${JSON.stringify({ _e: `test:${i}`, _t: Date.now() })}\n`
        );
      }

      const events = await collect(tap(session.sessionDir));
      expect(events.map(event => event._e)).toEqual([
        'test:4',
        'test:3',
        'test:2',
        'test:1',
        'test:0',
      ]);
    } finally {
      session.destroy();
      restoreDir();
      restoreIpc();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('parses malformed and filtered JSONL lines safely', () => {
    expect(parseEventLine('not-json')).toBeNull();
    expect(
      parseEventLine(JSON.stringify({ _e: 'metro:done', _t: 1000 }), {
        filter: ['env'],
      })
    ).toBeNull();
    expect(
      parseEventLine(JSON.stringify({ _e: 'metro:done', _t: Date.now() }))
    ).toMatchObject({
      _e: 'metro:done',
    });
  });

  it('filters events by segment prefix, comma lists, repeated values, and wildcards', () => {
    expect(
      parseEventLine(JSON.stringify({ _e: 'metro:done', _t: Date.now() }), {
        filter: 'metro',
      })
    ).toMatchObject({ _e: 'metro:done' });
    expect(
      parseEventLine(JSON.stringify({ _e: 'metro:done', _t: Date.now() }), {
        filter: 'metro:done',
      })
    ).toMatchObject({ _e: 'metro:done' });
    expect(
      parseEventLine(
        JSON.stringify({ _e: 'metro:bundling:started', _t: Date.now() }),
        {
          filter: 'metro:bundling',
        }
      )
    ).toMatchObject({ _e: 'metro:bundling:started' });
    expect(
      parseEventLine(
        JSON.stringify({ _e: 'metro:bundling2', _t: Date.now() }),
        {
          filter: 'metro:bundling',
        }
      )
    ).toBeNull();
    expect(
      parseEventLine(JSON.stringify({ _e: 'metro:done', _t: Date.now() }), {
        filter: 'metro:do',
      })
    ).toBeNull();
    expect(
      parseEventLine(JSON.stringify({ _e: 'metro:done', _t: Date.now() }), {
        filter: 'metro:test*',
      })
    ).toBeNull();
    expect(
      parseEventLine(
        JSON.stringify({ _e: 'metro:test-done', _t: Date.now() }),
        {
          filter: 'metro:test*',
        }
      )
    ).toMatchObject({ _e: 'metro:test-done' });
    expect(
      parseEventLine(JSON.stringify({ _e: 'metro:done', _t: Date.now() }), {
        filter: ['env,metro:*'],
      })
    ).toMatchObject({ _e: 'metro:done' });
    expect(
      parseEventLine(JSON.stringify({ _e: 'metro:done', _t: Date.now() }), {
        filter: ['env:*', 'met*'],
      })
    ).toMatchObject({ _e: 'metro:done' });
  });

  it('drops debug events unless debug is enabled', () => {
    const debugLine = JSON.stringify({ _e: 'metro:probe', _t: 1000, _l: 1 });
    expect(parseEventLine(debugLine)).toBeNull();
    expect(parseEventLine(debugLine, { debug: true })).toMatchObject({
      _e: 'metro:probe',
      _l: 1,
    });
    expect(
      parseEventLine(JSON.stringify({ _e: 'metro:done', _t: 1000, _l: 0 }))
    ).toMatchObject({ _e: 'metro:done' });
  });

  it('filters events by duration, unix timestamp, date, and ISO since values', () => {
    expect(parseSince(1_700_000_000)).toBe(1_700_000_000_000);
    expect(parseSince(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(parseSince(new Date('2024-01-01T00:00:00.000Z'))).toBe(
      1_704_067_200_000
    );

    const event = JSON.stringify({ _e: 'metro:done', _t: 1_704_067_200_000 });
    expect(
      parseEventLine(event, { since: '2024-01-01T00:00:00.000Z' })
    ).toMatchObject({ _e: 'metro:done' });
    expect(
      parseEventLine(event, { since: '2024-01-01T00:00:00.001Z' })
    ).toBeNull();
  });

  it('filters incompatible sessions from discovery', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-tap-'));
    const incompatible = path.join(dir, '999');
    const restoreDir = setSessionDir(dir);
    await fs.mkdir(incompatible, { recursive: true });
    await fs.writeFile(
      path.join(incompatible, SESSION_FILES.meta),
      JSON.stringify({
        pid: process.pid,
        formatVersion: EVENT_LOG_FORMAT_VERSION + 1,
        startedAt: Date.now(),
        command: 'incompatible',
        cwd: process.cwd(),
        socket: SESSION_FILES.liveSocket,
        ipcSocket: SESSION_FILES.ipcSocket,
      })
    );

    try {
      expect(await listSessions()).toEqual([]);
    } finally {
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('filters and resolves sessions by exact and fuzzy selectors', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-tap-'));
    const restoreDir = setSessionDir(dir);
    const cwd = path.join(dir, 'project');
    await writeMeta(path.join(dir, '101'), 101, 'expo start -p web', cwd);
    await writeMeta(
      path.join(dir, '202'),
      202,
      'expo export',
      path.join(dir, 'other')
    );

    try {
      await expect(resolveSession()).rejects.toThrow('Ambiguous 2g session');
      await expect(resolveSession('101')).resolves.toMatchObject({
        pid: 101,
      });
      await expect(resolveSession(cwd)).resolves.toMatchObject({
        command: 'expo start -p web',
      });
      await expect(resolveSession('start -p')).resolves.toMatchObject({
        pid: 101,
      });
      expect(await listSessions({ selector: 'expo' })).toHaveLength(2);
      await expect(resolveSession('expo')).rejects.toThrow(
        'Ambiguous 2g session "expo"'
      );
    } finally {
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('resolves a single active session from otherwise ambiguous matches', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-tap-'));
    const restoreDir = setSessionDir(dir);
    await writeMeta(
      path.join(dir, String(process.pid)),
      process.pid,
      'expo start active'
    );
    await writeMeta(path.join(dir, '999999'), 999999, 'expo start exited');

    try {
      await expect(resolveSession('expo start')).resolves.toMatchObject({
        pid: process.pid,
        command: 'expo start active',
      });
      await expect(resolveSession()).resolves.toMatchObject({
        pid: process.pid,
        command: 'expo start active',
      });
    } finally {
      restoreDir();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('stops following with timeout and idle timeout options', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-tap-'));
    const restoreDir = setSessionDir(dir);
    const restoreIpc = setEnv(INTERNAL_IPC_ENV, undefined);
    const session = createSession({ command: 'timeouts' });

    try {
      const timeoutEventsPromise = collect(
        tap(session.sessionDir, {
          follow: true,
          timeout: 100,
        })
      );
      await new Promise(resolve => setTimeout(resolve, 25));
      session.sink._writeln(
        `${JSON.stringify({ _e: 'test:timeout', _t: Date.now() })}\n`
      );
      const timeoutEvents = await timeoutEventsPromise;
      expect(timeoutEvents).toEqual([
        expect.objectContaining({ _e: 'test:timeout' }),
      ]);

      const idleEventsPromise = collect(
        tap(session.sessionDir, {
          follow: true,
          idleTimeout: 100,
        })
      );
      await new Promise(resolve => setTimeout(resolve, 25));
      session.sink._writeln(
        `${JSON.stringify({ _e: 'test:idle', _t: Date.now() })}\n`
      );
      const idleEvents = await idleEventsPromise;
      expect(idleEvents.length).toBeGreaterThan(0);
    } finally {
      session.destroy();
      restoreDir();
      restoreIpc();
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

function setSessionDir(dir: string) {
  _setSessionBaseDir(dir);
  return () => _setSessionBaseDir(undefined);
}

async function writeMeta(
  sessionDir: string,
  pid: number,
  command: string,
  cwd = process.cwd()
) {
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(
    path.join(sessionDir, SESSION_FILES.meta),
    JSON.stringify({
      pid,
      formatVersion: EVENT_LOG_FORMAT_VERSION,
      startedAt: Date.now(),
      command,
      cwd,
      socket: SESSION_FILES.liveSocket,
      ipcSocket: SESSION_FILES.ipcSocket,
      origin: {
        argv: process.argv.slice(1),
        execPath: process.execPath,
        cwd,
      },
    })
  );
}

async function collect(events: AsyncIterable<ParsedEvent>) {
  const output: ParsedEvent[] = [];
  for await (const event of events) output.push(event);
  return output;
}
