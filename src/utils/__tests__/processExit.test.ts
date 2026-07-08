import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PROCESS_CLEANUP = Symbol.for('2g/process-cleanup');

describe('processExit', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as any)[PROCESS_CLEANUP] = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (globalThis as any)[PROCESS_CLEANUP] = undefined;
  });

  it('leaves host signal handlers in control', async () => {
    const handlers: Record<string, (...args: any[]) => void> = {};
    vi.spyOn(process, 'once').mockImplementation((event: any, handler: any) => {
      handlers[String(event)] = handler;
      return process;
    });
    vi.spyOn(process, 'listenerCount').mockReturnValue(1);
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const cleanup = vi.fn();

    const { registerProcessCleanup } = await import('../processExit');
    registerProcessCleanup(cleanup);
    handlers.SIGINT();

    expect(cleanup).not.toHaveBeenCalled();
    expect(kill).not.toHaveBeenCalled();
  });

  it('cleans up and re-raises when it is the only signal handler', async () => {
    const handlers: Record<string, (...args: any[]) => void> = {};
    vi.spyOn(process, 'once').mockImplementation((event: any, handler: any) => {
      handlers[String(event)] = handler;
      return process;
    });
    vi.spyOn(process, 'listenerCount').mockReturnValue(0);
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const cleanup = vi.fn();

    const { registerProcessCleanup } = await import('../processExit');
    registerProcessCleanup(cleanup);
    handlers.SIGTERM();

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });
});
