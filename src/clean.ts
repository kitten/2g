import fs from 'node:fs';

import { DEFAULT_MAX_SESSIONS, DEFAULT_RETAIN_MS } from './constants';
import { getSessionEntries, type SessionEntry } from './discovery';

export function cleanStaleSessionsSync() {
  const now = Date.now();
  const dead: SessionEntry[] = [];
  let removed = 0;

  for (const entry of getSessionEntries()) {
    if (entry.alive) continue;
    if (now - entry.meta.startedAt > DEFAULT_RETAIN_MS) {
      fs.rmSync(entry.dir, { recursive: true, force: true });
      removed++;
    } else {
      dead.push(entry);
    }
  }

  dead.sort((a, b) => b.meta.startedAt - a.meta.startedAt);
  for (let idx = DEFAULT_MAX_SESSIONS; idx < dead.length; idx++) {
    fs.rmSync(dead[idx].dir, { recursive: true, force: true });
    removed++;
  }

  return removed;
}

export function cleanExitedSessionsSync() {
  let removed = 0;
  for (const entry of getSessionEntries()) {
    if (!entry.alive) {
      fs.rmSync(entry.dir, { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
}
