import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { DATABASE_MIGRATIONS, runMigrations } from '../../electron/main/database/db'
import { searchStockBasicByKeyword } from '../../electron/main/database/stockBasicCacheRepository'

describe('redundant code cleanup (Migration 157 / search)', () => {
  it('Migration 157 drops unused sector_flow_daily', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE sector_flow_daily (
        trade_date TEXT NOT NULL,
        source TEXT NOT NULL,
        concept_code TEXT NOT NULL,
        concept_name TEXT NOT NULL,
        total_amount REAL NOT NULL,
        net_inflow REAL NOT NULL,
        net_inflow_rate REAL NOT NULL,
        weighted_change REAL NOT NULL,
        member_count INTEGER NOT NULL,
        up_count INTEGER NOT NULL,
        down_count INTEGER NOT NULL,
        PRIMARY KEY (trade_date, source, concept_code)
      );
      CREATE INDEX idx_sector_flow_daily_date_source
        ON sector_flow_daily (trade_date, source);
    `)
    runMigrations(db, DATABASE_MIGRATIONS.filter((m) => m.version === 157))
    const row = db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sector_flow_daily'
    `).get() as { name: string } | undefined
    expect(row).toBeUndefined()
    db.close()
  })

  it('searchStockBasicByKeyword delegates suffix-aware matching', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE stock_basic_cache (
        ts_code TEXT PRIMARY KEY,
        name TEXT,
        industry TEXT,
        market TEXT,
        list_status TEXT,
        circ_float REAL,
        updated_at INTEGER NOT NULL
      );
    `)
    db.prepare(`
      INSERT INTO stock_basic_cache
        (ts_code, name, industry, market, list_status, circ_float, updated_at)
      VALUES ('600519.SH', '贵州茅台', NULL, '主板', 'L', NULL, 1)
    `).run()

    expect(searchStockBasicByKeyword(db, '600519')).toEqual([
      { tsCode: '600519.SH', name: '贵州茅台' },
    ])
    db.close()
  })
})
