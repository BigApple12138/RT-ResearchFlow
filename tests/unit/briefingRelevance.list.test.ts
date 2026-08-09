import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { listBriefings } from '../../electron/main/database/briefingRepository'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE portfolio_stocks (
      ts_code TEXT PRIMARY KEY,
      stock_name TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      cost_price REAL
    );
    CREATE TABLE briefings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sourceId INTEGER NOT NULL,
      sourceName TEXT NOT NULL,
      originalUrl TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      fullContent TEXT,
      publishedAt INTEGER NOT NULL,
      publishedDateBJ TEXT NOT NULL,
      publicationTimeStatus TEXT NOT NULL DEFAULT 'exact',
      collectedAt INTEGER NOT NULL,
      impactRating TEXT NOT NULL,
      impactRatingScore REAL NOT NULL,
      deduplicationHash TEXT NOT NULL UNIQUE,
      titleSimhash TEXT NOT NULL,
      isRead INTEGER NOT NULL,
      readAt INTEGER,
      scanRunId INTEGER,
      isCatchUp INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE briefings_fts USING fts5(
      title,
      summary,
      content='briefings',
      content_rowid='id'
    );
    CREATE TRIGGER briefings_ai AFTER INSERT ON briefings BEGIN
      INSERT INTO briefings_fts(rowid, title, summary) VALUES (new.id, new.title, new.summary);
    END;
  `)
  return db
}

function insertBriefing(
  db: Database.Database,
  input: {
    title: string
    summary?: string
    rating?: 'CRITICAL' | 'IMPORTANT' | 'GENERAL'
    isRead?: number
    publishedAt: number
  },
): void {
  db.prepare(`
    INSERT INTO briefings (
      sourceId, sourceName, originalUrl, title, summary, fullContent,
      publishedAt, publishedDateBJ, publicationTimeStatus, collectedAt, impactRating,
      impactRatingScore, deduplicationHash, titleSimhash,
      isRead, readAt, scanRunId, isCatchUp
    ) VALUES (1, '测源', ?, ?, ?, NULL, ?, '2026-08-09', 'exact', ?, ?, ?, ?, ?, ?, NULL, NULL, 0)
  `).run(
    `https://example.com/${input.publishedAt}`,
    input.title,
    input.summary ?? `${input.title}摘要`,
    input.publishedAt,
    input.publishedAt,
    input.rating ?? 'GENERAL',
    input.rating === 'CRITICAL' ? 90 : input.rating === 'IMPORTANT' ? 70 : 20,
    `h-${input.publishedAt}`,
    `${input.publishedAt}`,
    input.isRead ?? 0,
  )
}

describe('listBriefings portfolio relevance', () => {
  it('filters by holdings and attaches hits', () => {
    const db = createDb()
    try {
      db.prepare(
        'INSERT INTO portfolio_stocks (ts_code, stock_name, added_at, cost_price) VALUES (?, ?, ?, NULL)',
      ).run('600519.SH', '贵州茅台', 1)
      insertBriefing(db, { title: '贵州茅台提价观察', publishedAt: 300, isRead: 0 })
      insertBriefing(db, { title: '无关宏观评论', publishedAt: 200, isRead: 0 })
      insertBriefing(db, { title: '茅台渠道调研', summary: '贵州茅台经销商', publishedAt: 100, isRead: 1 })

      const result = listBriefings({ relevance: 'portfolio', limit: 50 }, db)
      expect(result.relevanceModeApplied).toBe('portfolio')
      expect(result.total).toBe(2)
      expect(result.unreadCount).toBe(1)
      expect(result.relevanceUnreadCount).toBe(1)
      expect(result.allUnreadCount).toBe(2)
      expect(result.items.every((item) => item.title.includes('茅台') || item.summary.includes('茅台'))).toBe(true)
      expect(result.items[0].relevanceHits?.length).toBeGreaterThan(0)
    } finally {
      db.close()
    }
  })

  it('falls back to all when portfolio is empty', () => {
    const db = createDb()
    try {
      insertBriefing(db, { title: '任意资讯', publishedAt: 1 })
      const result = listBriefings({ relevance: 'portfolio', limit: 50 }, db)
      expect(result.relevanceModeApplied).toBe('portfolio_fallback_empty')
      expect(result.total).toBe(1)
      expect(result.portfolioTermCount).toBe(0)
    } finally {
      db.close()
    }
  })

  it('combines relevance with impactRating', () => {
    const db = createDb()
    try {
      db.prepare(
        'INSERT INTO portfolio_stocks (ts_code, stock_name, added_at, cost_price) VALUES (?, ?, ?, NULL)',
      ).run('600519.SH', '贵州茅台', 1)
      insertBriefing(db, { title: '贵州茅台重大', rating: 'CRITICAL', publishedAt: 3 })
      insertBriefing(db, { title: '贵州茅台一般', rating: 'GENERAL', publishedAt: 2 })
      insertBriefing(db, { title: '无关重大', rating: 'CRITICAL', publishedAt: 1 })

      const result = listBriefings({ relevance: 'portfolio', impactRating: 'CRITICAL', limit: 50 }, db)
      expect(result.total).toBe(1)
      expect(result.items[0].title).toBe('贵州茅台重大')
    } finally {
      db.close()
    }
  })
})
