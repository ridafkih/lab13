const READ_GUARD_TTL_MS = 10 * 60 * 1000;

interface ReadRecord {
  at: number;
}

const readsBySession = new Map<string, Map<string, ReadRecord>>();

export function markFileRead(sessionId: string, absolutePath: string): void {
  let sessionReads = readsBySession.get(sessionId);
  if (!sessionReads) {
    sessionReads = new Map<string, ReadRecord>();
    readsBySession.set(sessionId, sessionReads);
  }
  sessionReads.set(absolutePath, { at: Date.now() });
}

export function hasRecentFileRead(
  sessionId: string,
  absolutePath: string
): boolean {
  const sessionReads = readsBySession.get(sessionId);
  if (!sessionReads) {
    return false;
  }

  const record = sessionReads.get(absolutePath);
  if (!record) {
    return false;
  }

  if (Date.now() - record.at > READ_GUARD_TTL_MS) {
    sessionReads.delete(absolutePath);
    return false;
  }

  return true;
}

export function consumeRecentFileRead(
  sessionId: string,
  absolutePath: string
): boolean {
  const exists = hasRecentFileRead(sessionId, absolutePath);
  if (!exists) {
    return false;
  }
  const sessionReads = readsBySession.get(sessionId);
  sessionReads?.delete(absolutePath);
  return true;
}
