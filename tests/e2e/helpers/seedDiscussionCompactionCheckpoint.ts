import { runElectronScript } from './screenshotDemoSeed'

/** 为讨论会话写入一条上下文压缩检查点（展示 Agent Context Engine 检查点列表）。 */
export function seedDiscussionCompactionCheckpoint(dbPath: string, sessionId: number): void {
  runElectronScript(String.raw`
    const Database = require('better-sqlite3')
    const { randomUUID } = require('crypto')
    const db = new Database(process.env.TRADE_WATCH_SEED_DB)
    const sessionId = Number(process.env.DEMO_SESSION_ID)
    const now = Date.now()
    const compactionId = randomUUID()
    db.prepare(
      'INSERT INTO ai_discussion_context_compactions (id, session_id, request_id, source_start_sequence, covered_through_sequence, source_messages_hash, summary_text, summary_hash, provider, model, tokens_before, tokens_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      compactionId,
      sessionId,
      '00000000-0000-4000-8000-000000000601',
      1,
      12,
      'a'.repeat(64),
      '累计摘要：保留本地研究目标、已确认事实、未决问题、证据缺口与下一步验证动作。',
      'b'.repeat(64),
      'deepseek',
      'deepseek-chat',
      9200,
      1180,
      now - 3600000,
    )
    db.close()
  `, { TRADE_WATCH_SEED_DB: dbPath, DEMO_SESSION_ID: String(sessionId) })
}
