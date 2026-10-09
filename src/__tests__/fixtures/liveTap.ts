import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { SESSION_FILES } from '../../constants';
import { tap, type TapOptions } from '../../tap';
import { createSocketAddress } from '../../utils/sessionSockets';

export async function openLiveTap(options: TapOptions = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), '2g-live-'));
  const address = createSocketAddress(dir, path.basename(dir), 'live');
  await fs.writeFile(
    path.join(dir, SESSION_FILES.meta),
    JSON.stringify({ socket: address.name, maxSegments: 1 })
  );
  let socket!: net.Socket;
  const server = net.createServer(client => {
    socket = client;
    socket.resume();
    socket.write('{"_e":"test:ready","_t":0}\n');
  });
  await new Promise<void>(resolve => server.listen(address.path, resolve));
  const iterator = tap(dir, { ...options, follow: true })[
    Symbol.asyncIterator
  ]();
  await iterator.next();

  return {
    socket,
    iterator,
    async close() {
      socket.destroy();
      await iterator.return!();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
