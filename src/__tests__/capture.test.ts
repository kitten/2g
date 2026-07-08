import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LOG_DEBUG_ENV, LOG_EVENTS_ENV } from '../constants';
import { captureEvents, type EventCapture } from '../capture';

const INDEX_PATH = fileURLToPath(new URL('../index.ts', import.meta.url));

const HOOK_SOURCE = `
const Module = require('node:module');
Module.registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !specifier.endsWith('.ts'))
        return nextResolve(specifier + '.ts', context);
      throw error;
    }
  },
});
`;

let tmpDir: string;
let hookPath: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-log-capture-'));
  hookPath = path.join(tmpDir, 'resolve-ts.cjs');
  await fs.writeFile(hookPath, HOOK_SOURCE);
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function spawnChild(capture: EventCapture, script: string) {
  return spawn(
    process.execPath,
    [
      '--experimental-transform-types',
      '--no-warnings',
      '--require',
      hookPath,
      '-e',
      `const { installEventLogger, events, flushEventLogger } = require(${JSON.stringify(INDEX_PATH)});\n${script}`,
    ],
    capture.spawnOptions({
      env: { ...process.env, [LOG_DEBUG_ENV]: '' },
      stdio: ['ignore', 'inherit', 'inherit'],
    })
  );
}

describe('captureEvents', () => {
  it('creates spawn options pointing LOG_EVENTS at the appended pipe', () => {
    const options = captureEvents().spawnOptions({
      env: { FOO: 'bar' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    expect(options.stdio).toEqual(['ignore', 'pipe', 'inherit', 'pipe']);
    expect(options.env[LOG_EVENTS_ENV]).toBe('3');
    expect(options.env.FOO).toBe('bar');

    const defaults = captureEvents().spawnOptions();
    expect(defaults.stdio).toEqual(['inherit', 'inherit', 'inherit', 'pipe']);
    expect(defaults.env[LOG_EVENTS_ENV]).toBe('3');
    expect(defaults.env.PATH).toBe(process.env.PATH);

    const withIpc = captureEvents().spawnOptions({
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });
    expect(withIpc.stdio).toEqual([
      'inherit',
      'inherit',
      'inherit',
      'ipc',
      'pipe',
    ]);
    expect(withIpc.env[LOG_EVENTS_ENV]).toBe('4');

    const fromString = captureEvents().spawnOptions({ stdio: 'ignore' });
    expect(fromString.stdio).toEqual(['ignore', 'ignore', 'ignore', 'pipe']);
  });

  it('captures events from a child on the env-only install path', async () => {
    const capture = captureEvents();
    const child = spawnChild(
      capture,
      `installEventLogger();
       const log = events('alpha');
       log('one', { n: 1 });
       events.debug('alpha')('noise');
       events('beta')('two', { n: 2 });`
    );

    const received = await capture.attach(child).collect();
    expect(received.map(event => event._e)).toEqual([
      'root:init',
      'alpha:one',
      'beta:two',
    ]);
    expect(received[1]).toMatchObject({ _e: 'alpha:one', n: 1 });
    expect(received[1]._t).toEqual(expect.any(Number));
  });

  it('honors debug and filter options like tap', async () => {
    const capture = captureEvents({ filter: 'alpha:*', debug: true });
    const child = spawnChild(
      capture,
      `installEventLogger();
       events('alpha')('one');
       events.debug('alpha')('noise');
       events('beta')('two');`
    );

    const received = await capture.attach(child).collect();
    expect(received.map(event => event._e)).toEqual([
      'alpha:one',
      'alpha:noise',
    ]);
    expect(received[1]._l).toBe(1);
  });

  it('drains the pipe while the child writes past the pipe buffer', async () => {
    const capture = captureEvents({ filter: 'bulk:*' });
    const child = spawnChild(
      capture,
      `installEventLogger();
       const log = events('bulk');
       const pad = 'x'.repeat(200);
       for (let i = 0; i < 5000; i++) log('row', { i, pad });
       log('done');`
    );

    const received = await capture.attach(child).collect();
    expect(received).toHaveLength(5001);
    expect(received[received.length - 1]._e).toBe('bulk:done');
    expect(
      received.slice(0, 5000).every((event, index) => event.i === index)
    ).toBe(true);
  });

  it('receives events written immediately before natural exit', async () => {
    const capture = captureEvents({ filter: 'tail:*' });
    const child = spawnChild(
      capture,
      `installEventLogger();
       events('tail')('last', { final: true });`
    );

    const received = await capture.attach(child).collect();
    expect(received).toEqual([
      expect.objectContaining({ _e: 'tail:last', final: true }),
    ]);
  });

  it('throws without spawnOptions, without attach, or on a missing pipe', async () => {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    expect(() => captureEvents().attach(child)).toThrow(/spawnOptions/);

    const capture = captureEvents();
    capture.spawnOptions();
    expect(() => capture.attach(child)).toThrow(/not a readable pipe/);
    await expect(captureEvents().collect()).rejects.toThrow(/attach/);
    await new Promise(resolve => child.once('exit', resolve));
  });
});
