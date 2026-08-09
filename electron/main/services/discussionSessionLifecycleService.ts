import type Database from 'better-sqlite3'
import {
  deleteSession,
  getSession,
  deleteSessionsOlderThan,
} from '../database/aiAnalysisSessionRepository'
import { getResearchDiscussionContext } from '../database/researchDiscussionRepository'
import { deleteResearchDiscussion } from './researchDiscussionContextService'
import { withDiscussionSessionLock } from './discussionSessionLock'

export interface SessionDeletionSummary {
  deleted: number
  deletedResearchDiscussions: number
}

function listSessionIds(db: Database.Database, includeResearchDiscussions: boolean): number[] {
  const query = includeResearchDiscussions
    ? 'SELECT id FROM ai_analysis_sessions ORDER BY id ASC'
    : `
        SELECT s.id
        FROM ai_analysis_sessions s
        WHERE NOT EXISTS (
          SELECT 1 FROM ai_research_discussion_contexts c WHERE c.session_id = s.id
        )
        ORDER BY s.id ASC
      `
  return (db.prepare(query).all() as Array<{ id: number }>).map((row) => row.id)
}

function listResearchDiscussionSessionIds(db: Database.Database): number[] {
  return (db.prepare(`
    SELECT session_id
    FROM ai_research_discussion_contexts
    ORDER BY session_id ASC
  `).all() as Array<{ session_id: number }>).map((row) => row.session_id)
}

export async function deleteSessionWithSessionLock(
  db: Database.Database,
  sessionId: number,
  options: { allowResearchDiscussion?: boolean } = {},
): Promise<{ deleted: boolean; deletedResearchDiscussion: boolean }> {
  return withDiscussionSessionLock(sessionId, () => {
    if (!getSession(db, sessionId)) {
      return { deleted: false, deletedResearchDiscussion: false }
    }
    const discussion = getResearchDiscussionContext(db, sessionId)
    if (discussion) {
      if (options.allowResearchDiscussion === false) {
        return { deleted: false, deletedResearchDiscussion: true }
      }
      deleteResearchDiscussion(db, sessionId)
      return { deleted: true, deletedResearchDiscussion: true }
    }
    deleteSession(db, sessionId)
    return { deleted: true, deletedResearchDiscussion: false }
  })
}

/**
 * Deletes every session selected by the AI cleanup action. Each session is
 * rechecked after acquiring its own lock so a follow-up/compaction cannot
 * write over a deletion and a stale list entry is harmless.
 */
export async function deleteAllSessionsWithSessionLocks(
  db: Database.Database,
  includeResearchDiscussions = false,
): Promise<SessionDeletionSummary> {
  const deletedResearchDiscussions = includeResearchDiscussions
    ? await deleteAllResearchDiscussionsWithSessionLocks(db)
    : 0
  const ids = listSessionIds(db, false)
  let deleted = 0

  for (const sessionId of ids) {
    await withDiscussionSessionLock(sessionId, () => {
      if (!getSession(db, sessionId)) return
      const discussion = getResearchDiscussionContext(db, sessionId)
      if (discussion) {
        return
      }
      deleteSession(db, sessionId)
      deleted += 1
    })
  }

  return { deleted, deletedResearchDiscussions }
}

/** Deletes research discussions one at a time behind their session locks. */
export async function deleteAllResearchDiscussionsWithSessionLocks(
  db: Database.Database,
): Promise<number> {
  let deleted = 0
  for (const sessionId of listResearchDiscussionSessionIds(db)) {
    await withDiscussionSessionLock(sessionId, () => {
      if (!getResearchDiscussionContext(db, sessionId)) return
      deleteResearchDiscussion(db, sessionId)
      deleted += 1
    })
  }
  return deleted
}

function listOldSessionIds(db: Database.Database, cutoff: number): number[] {
  return (db.prepare(`
    SELECT s.id
    FROM ai_analysis_sessions s
    WHERE s.createdAt < ?
      AND NOT EXISTS (
        SELECT 1 FROM ai_research_discussion_contexts c WHERE c.session_id = s.id
      )
    ORDER BY s.id ASC
  `).all(cutoff) as Array<{ id: number }>).map((row) => row.id)
}

export async function deleteSessionsOlderThanWithSessionLocks(
  db: Database.Database,
  olderThanMs: number,
  dryRun: boolean,
): Promise<{ count: number; deleted: number }> {
  if (dryRun) return deleteSessionsOlderThan(db, olderThanMs, true)

  const cutoff = Date.now() - olderThanMs
  const ids = listOldSessionIds(db, cutoff)
  let deleted = 0
  for (const sessionId of ids) {
    await withDiscussionSessionLock(sessionId, () => {
      const session = getSession(db, sessionId)
      if (!session || session.createdAt >= cutoff || getResearchDiscussionContext(db, sessionId)) return
      deleteSession(db, sessionId)
      deleted += 1
    })
  }
  return { count: ids.length, deleted }
}
