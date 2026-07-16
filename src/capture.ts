import type { ChildProcess, StdioOptions } from 'node:child_process';
import type { Readable } from 'node:stream';

import { INTERNAL_DEBUG_ENV, LOG_EVENTS_ENV } from './constants';
import type { TapOptions } from './tap';
import type { ParsedEvent } from './types';
import { compileEventFilter, parseEventLine } from './utils/eventFilter';

export type CaptureOptions = Pick<TapOptions, 'debug' | 'filter'>;

export interface CaptureSpawnOptions {
  env?: NodeJS.ProcessEnv;
  stdio?: StdioOptions;
}

export class EventCapture implements AsyncIterable<ParsedEvent> {
  #options: CaptureOptions;
  #eventFilter: RegExp | null;
  #index: number | undefined;
  #attached = false;
  #done = false;
  #events: ParsedEvent[] = [];
  #waiters: Array<(event: ParsedEvent | null) => void> = [];

  constructor(options: CaptureOptions = {}) {
    this.#options = options;
    this.#eventFilter = compileEventFilter(options.filter);
  }

  spawnOptions<T extends CaptureSpawnOptions>(
    options?: T
  ): T & Required<CaptureSpawnOptions> {
    const stdio: Extract<StdioOptions, readonly unknown[]> = Array.isArray(
      options?.stdio
    )
      ? [...options.stdio]
      : options?.stdio != null
        ? [options.stdio, options.stdio, options.stdio]
        : [];
    while (stdio.length < 3) stdio.push('inherit');
    this.#index = stdio.length;
    stdio.push('pipe');
    const env = {
      ...(options?.env ?? process.env),
      [LOG_EVENTS_ENV]: `${this.#index}`,
    };
    if (this.#options.debug === true) {
      env[INTERNAL_DEBUG_ENV] = '1';
    }

    return {
      ...(options as T),
      stdio,
      env,
    };
  }

  attach(child: ChildProcess): this {
    if (this.#index == null)
      throw new Error(
        'captureEvents: spawnOptions() must create the pipe before attach()'
      );
    if (this.#attached)
      throw new Error('captureEvents: a child is already attached');
    const stream = child.stdio[this.#index] as Readable | null | undefined;
    if (!stream || typeof stream.setEncoding !== 'function')
      throw new Error(
        `captureEvents: child stdio[${this.#index}] is not a readable pipe`
      );
    this.#attached = true;

    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      const data = pending ? pending + chunk : chunk;
      let start = 0;
      let end: number;
      while ((end = data.indexOf('\n', start)) !== -1) {
        const line = data.slice(start, end);
        start = end + 1;
        if (line) this.#ingest(line);
      }
      pending = start ? data.slice(start) : data;
    });

    const finish = () => {
      if (this.#done) return;
      this.#done = true;
      if (pending) this.#ingest(pending);
      this.#notify(null);
    };
    stream.on('end', finish);
    stream.on('close', finish);
    stream.on('error', finish);
    return this;
  }

  async collect(): Promise<ParsedEvent[]> {
    const events: ParsedEvent[] = [];
    for await (const event of this) events.push(event);
    return events;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<ParsedEvent> {
    let event: ParsedEvent | null;
    while ((event = await this.#next())) yield event;
  }

  #ingest(line: string) {
    const event = parseEventLine(line, this.#options, this.#eventFilter);
    if (event) this.#notify(event);
  }

  #notify(event: ParsedEvent | null) {
    const waiter = this.#waiters.shift();
    if (waiter) waiter(event);
    else if (event) this.#events.push(event);
  }

  #next(): Promise<ParsedEvent | null> {
    if (this.#events.length) return Promise.resolve(this.#events.shift()!);
    if (this.#done) return Promise.resolve(null);
    if (!this.#attached)
      throw new Error('captureEvents: attach() a child before iterating');
    return new Promise(resolve => this.#waiters.push(resolve));
  }
}

export function captureEvents(options?: CaptureOptions): EventCapture {
  return new EventCapture(options);
}
