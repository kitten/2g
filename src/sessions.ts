import fs from 'node:fs/promises';
import path from 'node:path';

import { cleanStaleSessionsSync } from './clean';
import {
  getSessionBaseDir,
  isPidAlive,
  newestSessionIds,
  readMetaSync,
} from './discovery';
import type { SessionMeta } from './session';
import type { EventLoggerMetadata } from './types';

export interface ListedSession {
  id: string;
  pid: number;
  alive: boolean;
  startedAt: number;
  command: string;
  cwd: string;
  metadata: EventLoggerMetadata;
  origin?: SessionMeta['origin'];
  sessionDir: string;
}

export interface ListSessionsOptions {
  selector?: string;
}

export async function listSessions(
  options: ListSessionsOptions = {}
): Promise<ListedSession[]> {
  cleanStaleSessionsSync();
  const baseDir = getSessionBaseDir();
  const entries = await fs
    .readdir(baseDir, { withFileTypes: true })
    .catch(() => []);
  const sessions: ListedSession[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionDir = path.join(baseDir, entry.name);
    const meta = readMetaSync(sessionDir);
    if (!meta) continue;
    sessions.push({
      id: entry.name,
      pid: meta.pid,
      alive: false,
      startedAt: meta.startedAt,
      command: meta.command,
      cwd: meta.cwd,
      metadata: meta.metadata ?? {},
      origin: meta.origin,
      sessionDir,
    });
  }

  const newest = newestSessionIds(sessions);
  for (const session of sessions) {
    session.alive = isPidAlive(session.pid) && newest.has(session.id);
  }

  return filterSessions(sessions, options.selector).sort(
    (a, b) => b.startedAt - a.startedAt
  );
}

export async function resolveSession(selector?: string) {
  const sessions = await listSessions({ selector });
  const activeSessions = sessions.filter(session => session.alive);
  const session =
    sessions.length === 1
      ? sessions[0]
      : activeSessions.length === 1
        ? activeSessions[0]
        : null;
  if (!session)
    throw new Error(
      selector != null
        ? sessions.length
          ? `Ambiguous 2g session "${selector}"; specify one of: ${sessions
              .map(formatSessionSelector)
              .join(', ')}`
          : `No 2g session matching "${selector}"`
        : sessions.length
          ? `Ambiguous 2g session; specify one of: ${sessions
              .map(formatSessionSelector)
              .join(', ')}`
          : 'No 2g sessions found'
    );
  return session;
}

function filterSessions(
  sessions: ListedSession[],
  selector: string | undefined
) {
  const input = selector?.trim();
  if (!input) return sessions;

  const exact = sessions.filter(session =>
    matchesSessionExactly(session, input)
  );
  if (exact.length) return exact;

  const normalized = input.toLowerCase();
  return sessions.filter(session =>
    sessionSearchValues(session).some(value =>
      value.toLowerCase().includes(normalized)
    )
  );
}

function formatSessionSelector(session: ListedSession) {
  return `${session.pid} (${session.command})`;
}

function matchesSessionExactly(session: ListedSession, selector: string) {
  return sessionSearchValues(session).some(value => value === selector);
}

function sessionSearchValues(session: ListedSession) {
  return [
    session.id,
    String(session.pid),
    session.sessionDir,
    session.cwd,
    session.command,
    session.origin?.cwd,
    session.origin?.argv.join(' '),
    session.origin?.execPath,
    session.origin?.env?.npmLifecycleEvent,
    session.origin?.env?.npmPackageName,
  ].filter((value): value is string => !!value);
}
