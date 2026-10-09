import fs from 'node:fs';
import path from 'node:path';

import { EVENT_LOG_TMP_DIR, SESSION_FILES } from './constants';
import type { SessionMeta } from './session';

export interface SessionEntry {
  id: string;
  dir: string;
  meta: SessionMeta;
  alive: boolean;
}

const SESSION_BASE_DIR_OVERRIDE = Symbol.for('2g/session-base-dir-override');

interface EventLogGlobal {
  [SESSION_BASE_DIR_OVERRIDE]?: string;
}

export function readMetaSync(sessionDir: string): SessionMeta | null {
  try {
    const meta = JSON.parse(
      fs.readFileSync(path.join(sessionDir, SESSION_FILES.meta), 'utf8')
    );
    if (!meta || typeof meta !== 'object') return null;
    meta.metadata ??= {};
    return meta;
  } catch {
    return null;
  }
}

export function getSessionBaseDir() {
  return (
    (globalThis as EventLogGlobal)[SESSION_BASE_DIR_OVERRIDE] ||
    EVENT_LOG_TMP_DIR
  );
}

export function _setSessionBaseDir(dir: string | undefined) {
  const globalScope = globalThis as EventLogGlobal;
  if (dir) globalScope[SESSION_BASE_DIR_OVERRIDE] = dir;
  else delete globalScope[SESSION_BASE_DIR_OVERRIDE];
}

export function isPidAlive(pid: number) {
  if (!pid || pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getSessionEntries() {
  try {
    const baseDir = getSessionBaseDir();
    const entries = fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => {
        const dir = path.join(baseDir, entry.name);
        return { id: entry.name, dir, meta: readMetaSync(dir), alive: false };
      })
      .filter((entry): entry is SessionEntry => entry.meta !== null);
    // Only the newest session per pid can be alive; older generations cannot
    // belong to the process that owns a recycled PID now.
    const newest = new Map<number, SessionEntry>();
    for (const entry of entries) {
      const current = newest.get(entry.meta.pid);
      if (
        !current ||
        entry.meta.startedAt > current.meta.startedAt ||
        (entry.meta.startedAt === current.meta.startedAt &&
          entry.id > current.id)
      ) {
        newest.set(entry.meta.pid, entry);
      }
    }
    for (const entry of newest.values()) {
      entry.alive = isPidAlive(entry.meta.pid);
    }
    return entries;
  } catch {
    return [];
  }
}
