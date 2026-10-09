import fs from 'node:fs';

import { DEFAULT_MAX_SESSIONS, DEFAULT_RETAIN_MS } from './constants';
import { getSessionEntries, type SessionEntry } from './discovery';

export function cleanStaleSessionsSync() {
  const entries = getSessionEntries();
  return entries.length - cleanStaleSessionEntriesSync(entries).length;
}

export function cleanStaleSessionEntriesSync(entries: SessionEntry[]) {
  const now = Date.now();
  const retained: SessionEntry[] = [];
  const dead: SessionEntry[] = [];

  for (const entry of entries) {
    if (entry.alive) {
      retained.push(entry);
    } else if (now - entry.meta.startedAt > DEFAULT_RETAIN_MS) {
      fs.rmSync(entry.dir, { recursive: true, force: true });
    } else {
      dead.push(entry);
    }
  }

  dead.sort((a, b) => b.meta.startedAt - a.meta.startedAt);
  for (let idx = DEFAULT_MAX_SESSIONS; idx < dead.length; idx++) {
    fs.rmSync(dead[idx].dir, { recursive: true, force: true });
  }

  return retained.concat(dead.slice(0, DEFAULT_MAX_SESSIONS));
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
