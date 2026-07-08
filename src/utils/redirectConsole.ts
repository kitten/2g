import { Console } from 'node:console';

export function redirectConsoleToStderr() {
  globalThis.console = new Console(process.stderr, process.stderr);
}

export function redirectConsoleForFd(fd: number) {
  if (fd === 1) {
    const output = process.stderr;
    Object.defineProperty(process, 'stdout', { get: () => output });
    globalThis.console = new Console(output, output);
  } else if (fd === 2) {
    const output = process.stdout;
    Object.defineProperty(process, 'stderr', { get: () => output });
    globalThis.console = new Console(output, output);
  }
}
