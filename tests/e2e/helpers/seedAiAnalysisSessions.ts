import { runElectronScript } from './screenshotDemoSeed'

export function seedAiAnalysisSessions(dbPath: string): { emptySessionId: number; riskSessionId: number } {
  const output = runElectronScript(String.raw`
    const Database = require('better-sqlite3')
    const db = new Database(process.env.TRADE_WATCH_SEED_DB)
    const now = Date.now()
    const insertSession = db.prepare(
      'INSERT INTO ai_analysis_sessions (createdAt, provider, model, articleUrls, promptSent, response, scanRunId, briefingId, isError, messages) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)'
    )
    const empty = insertSession.run(now - 1000, 'chatgpt', 'e2e-empty-model', JSON.stringify(['https://example.com/empty']), 'e2e empty prompt', '行业新闻与A股映射仍待补充。\nSTOCK_CODES: NONE').lastInsertRowid
    const riskResponse = ['监管变化可能增加银行合规成本，影响仍需公司公告验证。', 'STOCK_CODES: NONE', '', '## A股标的映射补充', '', '浦发银行可能面临合规成本上升，属于直接证据线索。', 'STOCK_CODES: 600000|浦发银行'].join('\n')
    const risk = insertSession.run(now, 'chatgpt', 'gpt-5.6-sol', JSON.stringify(['https://example.com/risk']), 'e2e risk prompt', riskResponse).lastInsertRowid
    db.prepare('UPDATE ai_analysis_sessions SET responseRound2 = ? WHERE id = ?').run(
      '## 行情数据边界\n\n- **当前时间：**2026年7月21日16:54\n- **行情截止：**2026年7月17日收盘\n\n## 个股走势与支撑压力参考\n\n### 浦发银行（600000）\n\n近期行情已完成复核。\n\n- 支撑观察参考：模型纯文本支撑 9.99\n- 压力观察参考：模型纯文本压力 12.88\n\n## 风险与反证\n\n政策执行口径仍待确认。',
      risk
    )
    const insertDaily = db.prepare('INSERT OR REPLACE INTO daily_close_cache (ts_code, trade_date, close, pct_chg, open, high, low, vol, turnover_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    let barIndex = 0
    for (let cursor = Date.UTC(2026, 5, 8); cursor <= Date.UTC(2026, 6, 17); cursor += 86400000) {
      const day = new Date(cursor).getUTCDay()
      if (day === 0 || day === 6) continue
      const close = 10 + barIndex * 0.08 + Math.sin(barIndex / 3) * 0.12
      const previous = barIndex === 0 ? close : 10 + (barIndex - 1) * 0.08 + Math.sin((barIndex - 1) / 3) * 0.12
      const tradeDate = new Date(cursor).toISOString().slice(0, 10).replace(/-/g, '')
      insertDaily.run('600000.SH', tradeDate, close, (close / previous - 1) * 100, close - 0.05, close + 0.18, close - 0.2, 1000000 + barIndex * 12000, 1.2)
      barIndex += 1
    }
    const candidate = [{ code: '600000', name: '浦发银行', direction: 'negative', evidenceLevel: 'direct', reason: '监管变化可能增加合规成本', confidence: 0.82, evidence: ['文章明确描述成本上升'], riskNotes: ['实际影响仍需公告验证'] }]
    db.prepare(
      'INSERT INTO ai_analysis_structured_results (session_id, schema_version, status, summary, confidence, primary_theme, themes_json, candidate_stocks_json, risk_factors_json, verification_items_json, source_refs_json, raw_json, error_message, generated_at, updated_at) VALUES (?, 2, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)'
    ).run(risk, 'completed', '监管变化可能对持仓银行构成成本压力。', 0.82, '银行监管', '[]', JSON.stringify(candidate), JSON.stringify(['政策执行口径仍待确认']), JSON.stringify([{ title: '核验公司公告', status: 'todo', reason: '确认业务影响' }]), JSON.stringify([{ type: 'article', title: '监管新闻', excerpt: '合规成本可能上升' }]), now, now)
    db.prepare('INSERT OR REPLACE INTO portfolio_stocks (ts_code, stock_name, added_at, cost_price) VALUES (?, ?, ?, ?)').run('600000.SH', '浦发银行', now, 10.5)
    db.close()
    process.stdout.write(JSON.stringify({ emptySessionId: Number(empty), riskSessionId: Number(risk) }))
  `, { TRADE_WATCH_SEED_DB: dbPath })
  return JSON.parse(output) as { emptySessionId: number; riskSessionId: number }
}
