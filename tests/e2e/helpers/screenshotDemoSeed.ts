import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

export function runElectronScript(script: string, env: Record<string, string>): string {
  const electronExecutable = require('electron') as string
  return execFileSync(electronExecutable, ['-e', script], {
    cwd: join(__dirname, '../../..'),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString()
}

/** 在已跑完 Migration 的 trade-watch.db 上写入演示数据（E2E 专用，勿指向生产库）。 */
export function seedScreenshotDemoDatabase(dbPath: string): {
  briefingSourceId: number
  aiSessionId: number
  industryProjectId: string
} {
  const output = runElectronScript(String.raw`
    const Database = require('better-sqlite3')
    const { createHash } = require('crypto')
    const db = new Database(process.env.TRADE_WATCH_SEED_DB)
    db.pragma('foreign_keys = ON')
    const now = Date.now()
    const bjDate = new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const bjYmd = bjDate.replace(/-/g, '')
    const hash = (v) => createHash('sha256').update(String(v), 'utf8').digest('hex')
    const json = (v) => JSON.stringify(v)

    // 持仓
    db.prepare('DELETE FROM portfolio_stocks').run()
    const portfolioInsert = db.prepare('INSERT INTO portfolio_stocks (ts_code, stock_name, added_at, cost_price) VALUES (?, ?, ?, ?)')
    portfolioInsert.run('600519.SH', '贵州茅台', now - 86400000 * 30, 1680)
    portfolioInsert.run('600522.SH', '中天科技', now - 86400000 * 20, 12.5)
    portfolioInsert.run('000001.SZ', '平安银行', now - 86400000 * 10, 11.2)

    // 资讯
    const sourceId = Number(db.prepare(
      "INSERT INTO sources (nameCN, nameEN, url, feedUrl, category, authorityWeight, isBuiltIn, isEnabled, status, successRate, parseStrategy) VALUES (?, ?, ?, ?, 'CUSTOM', 9, 0, 1, 'ACTIVE', 1, 'RSS')"
    ).run('演示资讯源', 'Demo Feed', 'https://demo.example.com', 'https://demo.example.com/feed').lastInsertRowid)
    const briefingInsert = db.prepare(
      'INSERT INTO briefings (sourceId, sourceName, originalUrl, title, summary, fullContent, publishedAt, publishedDateBJ, publicationTimeStatus, collectedAt, impactRating, impactRatingScore, deduplicationHash, titleSimhash, isRead, readAt, scanRunId, isCatchUp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)'
    )
    briefingInsert.run(sourceId, '演示资讯源', 'https://demo.example.com/a1', '光模块景气度再获订单验证', '多家头部厂商披露扩产与订单回暖，产业链情绪改善。', '正文占位：用于 README 截图演示。', now - 3600000, bjDate, 'exact', now, 'CRITICAL', 92, 'demo-brief-a1', 'da1', 0)
    briefingInsert.run(sourceId, '演示资讯源', 'https://demo.example.com/a2', '白酒板块估值修复讨论升温', '机构对高端白酒估值锚出现分歧。', null, now - 7200000, bjDate, 'exact', now, 'IMPORTANT', 75, 'demo-brief-a2', 'da2', 0)
    db.prepare('INSERT OR REPLACE INTO daily_archive (date, totalCount, unreadCount, criticalCount, uncertainTimeCount, updatedAt) VALUES (?, 2, 2, 1, 0, ?)').run(bjDate, now)

    // 观察池 + 日线
    db.prepare('DELETE FROM trend_watchlist').run()
    const watchInsert = db.prepare('INSERT INTO trend_watchlist (ts_code, stock_name, category, sub_category, added_at) VALUES (?, ?, ?, ?, ?)')
    watchInsert.run('600519.SH', '贵州茅台', '消费', '白酒', now)
    watchInsert.run('600522.SH', '中天科技', '科技', '光通信', now)
    const dailyInsert = db.prepare('INSERT OR REPLACE INTO daily_close_cache (ts_code, trade_date, close, pct_chg, open, high, low, vol, turnover_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const stocks = [
      { code: '600519.SH', base: 1680 },
      { code: '600522.SH', base: 12.5 },
      { code: '000001.SZ', base: 11.2 },
    ]
    for (const stock of stocks) {
      for (let i = 0; i < 90; i += 1) {
        const d = new Date(Date.UTC(2026, 3, 1 + i))
        const ymd = String(d.getUTCFullYear()) + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0')
        const close = stock.base * (0.85 + i * 0.002) + Math.sin(i / 5) * 0.5
        const prev = stock.base * (0.85 + Math.max(0, i - 1) * 0.002) + Math.sin(Math.max(0, i - 1) / 5) * 0.5
        dailyInsert.run(stock.code, ymd, close, i === 0 ? 0 : (close - prev) / prev * 100, close - 0.2, close + 0.3, close - 0.4, 500000, 1.5)
      }
      db.prepare('INSERT OR REPLACE INTO stock_basic_cache (ts_code, name, industry, market, list_status, circ_float, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(stock.code, stock.code.startsWith('600519') ? '贵州茅台' : stock.code.startsWith('600522') ? '中天科技' : '平安银行', '演示', stock.code.endsWith('.SH') ? '主板' : '深市', 'L', 100000, now)
    }

    // 早盘竞价
    const tradeDate = '20260812'
    const prevDate = '20260811'
    db.prepare('INSERT OR REPLACE INTO trade_cal (cal_date, is_open, pretrade_date) VALUES (?, 1, ?)').run(tradeDate, prevDate)
    const auctionInsert = db.prepare('INSERT OR REPLACE INTO stk_auction_cache (ts_code, trade_date, price, vol, amount, pre_close, turnover_rate, volume_ratio, float_share, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const limitInsert = db.prepare('INSERT OR REPLACE INTO limit_list_daily (trade_date, ts_code, name, close, pct_chg, amount, float_mv, total_mv, turnover_ratio, fd_amount, first_time, last_time, open_times, up_stat, limit_times, "limit", fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    auctionInsert.run('600522.SH', tradeDate, 13.2, 2000000, 26000000, 12.8, 0.9, 1.8, 800000000, now)
    limitInsert.run(prevDate, '600522.SH', '中天科技', 12.8, 9.98, 880000000, 12000000000, 18000000000, 4.8, 90000000, '093100', '142800', 0, '1/1', 1, 'U', now)

    // 决策信号
    db.prepare('DELETE FROM decision_signals').run()
    db.prepare(
      'INSERT INTO decision_signals (source_module, strategy_key, ts_code, stock_name, signal_type, direction, priority, score, confidence, title, summary, reason_json, source_ref_json, status, dedup_key, signal_time, expire_at, created_at, updated_at, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('trend', 'trend.breakHigh20', '600522.SH', '中天科技', 'OPPORTUNITY', 'BULLISH', 4, 82, 76, '中天科技趋势转强待复核', '本地趋势评分抬升，需结合板块资金与竞价确认。', '{}', '{}', 'NEW', 'demo:600522:trend', now - 3600000, null, now, now, now, now)
    db.prepare(
      'INSERT INTO decision_signals (source_module, strategy_key, ts_code, stock_name, signal_type, direction, priority, score, confidence, title, summary, reason_json, source_ref_json, status, dedup_key, signal_time, expire_at, created_at, updated_at, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('portfolio', 'portfolio.risk', '600519.SH', '贵州茅台', 'RISK', 'BEARISH', 3, 70, 65, '持仓标的波动放大', '近 5 日振幅扩大，建议结合成本与趋势复核。', '{}', '{}', 'NEW', 'demo:600519:risk', now - 7200000, null, now, now, now, now)

    // AI 会话 + 讨论
    const messages = json([
      { role: 'user', content: '请结合本地趋势与板块资金，评估中天科技短线逻辑是否仍成立。' },
      { role: 'assistant', content: '## 研判摘要\n\n本地趋势评分抬升，但板块资金昨日分歧。建议等待竞价确认后再下结论。\n\n**待验证：** 订单景气是否延续到财报口径。' },
    ])
        const sessionId = Number(db.prepare(
          'INSERT INTO ai_analysis_sessions (createdAt, provider, model, articleUrls, promptSent, response, scanRunId, briefingId, isError, messages) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?)'
        ).run(now - 3600000, 'deepseek', 'deepseek-chat', '[]', '演示讨论上下文', messages, messages).lastInsertRowid)
    const context = {
      schemaVersion: 3,
      title: '中天科技短线逻辑复核',
      occurredAt: now - 3600000,
      items: [{ key: 'question', type: 'question', label: '问题', excerpt: '趋势与资金是否一致', removable: false }],
    }
    db.prepare(
      'INSERT INTO ai_research_discussion_contexts (session_id, start_request_id, status, origin_type, origin_id, origin_title, origin_occurred_at, origin_available, origin_content_hash, context_snapshot_json, context_keys_json, included_context_keys_json, return_target_json, project_id, base_snapshot_id, base_selection_reason, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, 1, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)'
        ).run(sessionId, '00000000-0000-4000-8000-000000000201', 'active', 'manual', '中天科技短线逻辑复核', now - 3600000, hash('demo-origin'), json(context), '[]', '[]', json({ tab: 'ai-analysis' }), 'unassigned', now, now)

        // 产业研究项目（简版）
    const projectId = 'demo-screenshot-project'
    db.prepare('DELETE FROM industry_research_projects WHERE id = ?').run(projectId)
    db.prepare(
      'INSERT INTO industry_research_projects (id, title, industry_name, product_scope, region_scope, time_scope, purpose, depth, status, data_as_of, source_type, source_ref, source_text_summary, skill_id, skill_content_hash, skill_rule_version, generation_model, graph_updated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(projectId, '光通信产业链演示', '光通信', '光纤光缆', '中国', '近三年', 'investment', 'standard', 'active', '2026-08-01', 'manual', 'README 截图演示数据', 'builtin:industry-chain-research', hash('skill'), 'sha256:demo', 'demo-model', now, now, now)

    db.close()
    process.stdout.write(JSON.stringify({ briefingSourceId: sourceId, aiSessionId: sessionId, industryProjectId: projectId }))
  `, { TRADE_WATCH_SEED_DB: dbPath })

  return JSON.parse(output) as { briefingSourceId: number; aiSessionId: number; industryProjectId: string }
}
