import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  installEventLogger,
  updateEventLoggerMetadata,
  flushEventLogger,
  getEventLoggerInfo,
} from '../install';
import { createSession, type SessionContext } from '../session';
import { _setSessionBaseDir, readMetaSync } from '../discovery';
import { _resetEventLogState, eventLogState } from '../state';
import { events } from '../events';
import { EVENT_LOG_FORMAT } from '../constants';
import { LogStream } from '../utils/logStream';
import { openIpc } from '../utils/ipc';
import { detectRotationLoss } from '../tap';
import { listSessions } from '../sessions';
import type { EventLoggerMetadata } from '../types';

let dir: string;
let session: SessionContext | undefined;
beforeEach(async () => {
  _resetEventLogState();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), '2g-metadata-'));
  _setSessionBaseDir(dir);
  for (const key of [
    'LOG_EVENTS',
    'LOG_DEBUG',
    '__eventLogIpc',
    '__eventLogDebug',
    '__eventLogProcessOrigin',
  ])
    vi.stubEnv(key, '');
});
afterEach(async () => {
  session?.destroy();
  session = undefined;
  _resetEventLogState();
  _setSessionBaseDir(undefined);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

function start(metadata?: EventLoggerMetadata, maxSegmentSize?: number) {
  session = createSession({ metadata, maxSegmentSize, maxSegments: 2 });
  eventLogState.primarySink = session.sink;
  eventLogState.updateMetadata = session.updateMetadata;
  return session;
}

it('initializes metadata in the session and root:init exactly once', async () => {
  installEventLogger({ metadata: { version: '1' } });
  const info = getEventLoggerInfo()!;
  installEventLogger({ metadata: { version: 'ignored' } });
  expect(readMetaSync(info.sessionDir!)?.metadata).toEqual({
    version: '1',
  });
  expect(readMetaSync(info.sessionDir!)?.format).toBe(EVENT_LOG_FORMAT);
  const lines = await readEvents(path.join(info.sessionDir!, '0.jsonl'));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({
    _e: 'root:init',
    version: '1',
  });
  expect(lines[0]).not.toHaveProperty('metadata');
  expect(lines[0]).not.toHaveProperty('format');
  expect(lines[0]).not.toHaveProperty('formatVersion');
  expect(readMetaSync(info.sessionDir!)).not.toHaveProperty('formatVersion');
  updateEventLoggerMetadata({ version: '2' });
  expect(readMetaSync(info.sessionDir!)?.metadata).toEqual({
    version: '2',
  });
  expect(readMetaSync(info.sessionDir!)?.format).toBe(EVENT_LOG_FORMAT);
});

it('persists shallow patches and later caller mutations without altering identity', async () => {
  const ctx = start(JSON.parse('{"version":"1","__proto__":{"custom":true}}'));
  const metadata = ctx.meta.metadata;
  const event = { _e: 'root:update', _t: 1, _private: true, port: 8080 };
  ctx.updateMetadata(event);
  expect(metadata).toMatchObject(event);
  Object.assign(metadata, { _later: true });
  const patch = {
    port: 8081,
    nested: { enabled: true },
    list: [1, 2],
    ready: false,
  };
  updateEventLoggerMetadata(patch as EventLoggerMetadata);
  patch.nested.enabled = false;
  patch.list.push(3);
  expect(readMetaSync(ctx.sessionDir)?.metadata).toMatchObject({
    nested: { enabled: true },
    list: [1, 2],
  });
  updateEventLoggerMetadata({ ready: false });
  expect(readMetaSync(ctx.sessionDir)?.metadata).toMatchObject({
    nested: { enabled: false },
    list: [1, 2, 3],
  });
  updateEventLoggerMetadata({
    nested: { _value: 0 },
    list: [],
    url: null,
  } as EventLoggerMetadata);
  const expected = {
    version: '1',
    port: 8081,
    nested: { _value: 0 },
    list: [],
    ready: false,
    url: null,
  };
  expect(readMetaSync(ctx.sessionDir)?.metadata).toEqual(expected);
  expect(ctx.meta.metadata).toBe(metadata);
  expect(metadata).toMatchObject({
    ['__proto__']: { custom: true },
    _later: true,
  });
  expect(Object.getPrototypeOf(metadata)).toBeNull();
  expect((await listSessions())[0].metadata).toEqual(expected);
  const lines = await readEvents();
  expect(lines[0]).toMatchObject({
    _e: 'root:update',
    nested: { enabled: true },
    list: [1, 2],
  });
  expect(readMetaSync(ctx.sessionDir)?.pid).toBe(process.pid);
});

it('ignores undefined patch fields while retaining null and falsy values', async () => {
  const ctx = start({
    version: '1',
    port: 8081,
    ready: true,
    devServerUrl: 'url',
  });
  const patch = {
    version: undefined,
    port: 0,
    ready: false,
    devServerUrl: null,
    nested: { keep: 0, omit: undefined },
  };
  updateEventLoggerMetadata(patch);
  const expected = {
    version: '1',
    port: 0,
    ready: false,
    devServerUrl: null,
    nested: { keep: 0 },
  };
  expect(readMetaSync(ctx.sessionDir)?.metadata).toEqual(expected);
  expect(ctx.meta.metadata.version).toBe('1');
  expect(ctx.meta.format).toBe(EVENT_LOG_FORMAT);
  const [event] = await readEvents();
  const { _e, _t, ...emittedPatch } = event;
  expect(_e).toBe('root:update');
  expect(_t).toEqual(expect.any(Number));
  expect(emittedPatch).toEqual({
    port: 0,
    ready: false,
    devServerUrl: null,
    nested: { keep: 0 },
  });
  expect({ version: '1', ...emittedPatch }).toEqual(expected);
  updateEventLoggerMetadata({ ready: true });
  expect(readMetaSync(ctx.sessionDir)?.metadata).toEqual({
    ...expected,
    ready: true,
  });
});

it('does not read metadata when logging is disabled', () => {
  const getter = vi.fn(() => '1');
  const metadata = Object.defineProperty({}, 'version', {
    enumerable: true,
    get: getter,
  });
  updateEventLoggerMetadata(metadata);
  expect(getter).not.toHaveBeenCalled();
  installEventLogger({ session: false, metadata });
  expect(getter).not.toHaveBeenCalled();
});

it('filters cycles and BigInts while preserving shared values and later updates', async () => {
  const shared = { enabled: true };
  const nested: any = { shared, invalid: 1n };
  nested.self = nested;
  nested.array = [nested, 1n, shared];
  const patch = { version: '2', nested, first: shared, second: shared };
  const expected = {
    version: '2',
    nested: { shared, array: [null, null, shared] },
    first: shared,
    second: shared,
  };
  installEventLogger({ metadata: patch });
  const sessionDir = getEventLoggerInfo()!.sessionDir!;
  const file = path.join(sessionDir, '0.jsonl');
  expect(readMetaSync(sessionDir)?.metadata).toEqual(expected);
  updateEventLoggerMetadata(patch);
  updateEventLoggerMetadata({ version: '3' });
  expect(readMetaSync(sessionDir)?.metadata).toEqual({
    ...expected,
    version: '3',
  });
  expect(await readEvents(file)).toEqual([
    expect.objectContaining({ _e: 'root:init', ...expected }),
    expect.objectContaining({ _e: 'root:update', ...expected }),
    expect.objectContaining({ _e: 'root:update', version: '3' }),
  ]);
});

it('continues recording when metadata persistence fails', async () => {
  start();
  const write = vi.spyOn(syncFs, 'writeFileSync').mockImplementation(() => {
    throw Error('unwritable');
  });
  expect(() => updateEventLoggerMetadata({ version: '2' })).not.toThrow();
  write.mockRestore();
  await flushEventLogger();
  expect(
    await fs.readFile(path.join(session!.sessionDir, '0.jsonl'), 'utf8')
  ).toContain('"version":"2"');
  expect(session!.meta.metadata).toEqual({
    version: '2',
  });
  expect(readMetaSync(session!.sessionDir)?.metadata).toEqual({});
});

it('keeps the latest metadata after rotation and full teardown', async () => {
  const ctx = start({ version: '1' }, 100);
  events('root')('init', {});
  updateEventLoggerMetadata({ version: '2' });
  for (let i = 0; i < 20; i++) {
    events('custom')('tick', { pad: 'x'.repeat(200) });
    await flushEventLogger();
  }
  expect(await detectRotationLoss(ctx.sessionDir)).toBe(true);
  expect(readMetaSync(ctx.sessionDir)?.metadata).toEqual({
    version: '2',
  });
  ctx.destroy();
  expect(readMetaSync(ctx.sessionDir)?.metadata).toEqual({
    version: '2',
  });
});

it("forwards child metadata without changing the parent's persisted metadata", async () => {
  const ctx = start({ version: 'parent' });
  const child = new LogStream(openIpc(process.env.__eventLogIpc!), {
    closeFd: false,
  });
  const metadata = { version: 'child', port: 8081 };
  const line = JSON.stringify({
    _e: 'root:update',
    _t: 1,
    _w: 'child',
    ...metadata,
  });
  try {
    child._writeln(`${line}\n`);
    await new Promise<void>(resolve => child.end(resolve));
    await vi.waitFor(async () =>
      expect(await readEvents()).toEqual([JSON.parse(line)])
    );
    expect(readMetaSync(ctx.sessionDir)?.metadata).toEqual({
      version: 'parent',
    });
    expect(ctx.meta.metadata).toEqual({
      version: 'parent',
    });
  } finally {
    child.destroy();
  }
});

it('records metadata patches to explicit destinations without creating sessions', async () => {
  const file = path.join(dir, 'explicit.jsonl');
  installEventLogger(file);
  updateEventLoggerMetadata({ port: 8081 });
  const lines = await readEvents(file);
  expect(await fs.readdir(dir)).toEqual(['explicit.jsonl']);
  expect(lines[0]._e).toBe('root:init');
  expect(lines[1]).toMatchObject({
    _e: 'root:update',
    port: 8081,
  });
});

async function readEvents(file = path.join(session!.sessionDir, '0.jsonl')) {
  await flushEventLogger();
  return (await fs.readFile(file, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}
