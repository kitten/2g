const PROCESS_CLEANUP = Symbol.for('2g/process-cleanup');

interface EventLogGlobal {
  [PROCESS_CLEANUP]?: ProcessCleanupState;
}

interface ProcessCleanupState {
  registered: boolean;
  callbacks: Set<() => void>;
}

export function registerProcessCleanup(callback: () => void) {
  const cleanup = getProcessCleanupState();
  cleanup.callbacks.add(callback);
  if (cleanup.registered) return;
  cleanup.registered = true;

  process.once('exit', runProcessCleanup);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.once(signal, () => {
      if (process.listenerCount(signal) > 0) return;
      runProcessCleanup();
      process.kill(process.pid, signal);
    });
  }
}

function getProcessCleanupState() {
  const globalScope = globalThis as EventLogGlobal;
  return (globalScope[PROCESS_CLEANUP] ??= {
    registered: false,
    callbacks: new Set(),
  });
}

function runProcessCleanup() {
  for (const callback of getProcessCleanupState().callbacks) {
    try {
      callback();
    } catch {}
  }
}
