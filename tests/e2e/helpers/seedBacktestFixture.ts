import { runElectronScript } from './screenshotDemoSeed'

/** E2E 策略评估演示数据（与 strategy-backtest-workbench 一致）。 */
export function seedBacktestFixture(dbPath: string): void {
  runElectronScript(String.raw`
    const Database = require('better-sqlite3')
    const db = new Database(process.env.TRADE_WATCH_SEED_DB)
    const plan = { entryRule: 'nextOpen', holdDays: 3, stopProfit: null, stopLoss: null, feeBps: 13, signalSource: 'shortTerm' }
    const credibility = {
      version: 1, assessedAt: Date.now(), conclusion: 'exploratory',
      summary: '当前样本可用于观察方向，但尚不足以形成稳定比较。',
      dataQualityFingerprint: 'fixture-quality-fingerprint-20260724',
      gates: [
        { key: 'dataFoundation', title: '数据底座', status: 'degraded', summary: '核心基准覆盖仍需注意', details: ['日线可用，核心基准覆盖仍需补齐。'] },
        { key: 'temporalIntegrity', title: '时间完整性', status: 'reliable', summary: '未发现时间顺序违规', details: ['入场晚于信号日，出场不早于入场日。'] },
        { key: 'executionRealism', title: '成交可执行性', status: 'degraded', summary: '尚未模拟逐笔成交约束', details: ['未模拟涨跌停、停牌、容量和滑点。'] },
        { key: 'sampleAdequacy', title: '样本充分性', status: 'degraded', summary: '有效样本少于30笔', details: ['当前只有1笔有效样本。'] },
        { key: 'stabilityValidation', title: '稳健性验证', status: 'degraded', summary: '尚未完成样本外验证', details: ['当前仅提供前后半区间观察。'] }
      ],
      sample: { totalSignals: 1, validSignals: 1, signalDayCount: 1, missingRate: 0 },
      periodSlices: [
        { label: '前半区间', sampleCount: 1, avgReturn: -19.56, winRate: 0 },
        { label: '后半区间', sampleCount: 0, avgReturn: null, winRate: null }
      ]
    }
    const report = {
      schemaVersion: 4, generatedAt: Date.now(),
      trust: { status: 'degraded', reasons: ['UNADJUSTED_PRICES', 'REALIZED_EQUITY_ONLY'], engineVersion: '4.0.0', factFingerprint: 'fixture-fingerprint-20260721', credibility },
      strategyKey: 'shortTerm.*', signalSource: 'shortTerm', dateRange: { start: '20260621', end: '20260721' },
      plan: { entryRule: 'nextOpen', holdDays: 3, stopProfit: null, stopLoss: null, feeBps: 13 },
      totalSignals: 1, validTrades: 1, dropRate: 0, winRate: 0, avgReturn: -19.56, medianReturn: -19.56,
      profitFactor: 0.12, expectancy: -19.56, equityModel: 'equal_weighted_exit_day_compound', totalReturn: -19.56,
      equityCurve: [{ date: '20260717', realizedReturnPct: -19.56, tradeCount: 1, equity: 0.8044, drawdownPct: 19.56 }],
      maxDrawdown: 19.56, sharpeLike: 1.42,
      byStrengthDecile: [{ bucket: 1, minStrength: 88, maxStrength: 88, count: 1, winRate: 0, avgReturn: -19.56, medianReturn: -19.56, profitFactor: 0, expectancy: -19.56 }],
      benchmarkReturn: -6.83, excessReturn: -12.73, benchmarkNote: null
    }
    const info = db.prepare(
      "INSERT INTO strategy_backtest_runs (strategy_key, date_start, date_end, plan_json, param_hash, report_json, status, error_message, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', NULL, ?, ?)"
    ).run('shortTerm.*', '20260621', '20260721', JSON.stringify(plan), 'e2e-backtest-workbench-fixture', JSON.stringify(report), Date.now(), Date.now())
    const runId = Number(info.lastInsertRowid)
    db.prepare('INSERT OR REPLACE INTO stock_info (stockCode, stockName, fetchedAt) VALUES (?, ?, ?)').run('000001', '平安银行', Date.now())
    db.prepare(
      "INSERT INTO strategy_backtest_trades (run_id, strategy_key, ts_code, signal_date, entry_date, entry_price, exit_date, exit_price, gross_return_pct, net_return_pct, return_pct, exit_reason, status, strength, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(runId, 'shortTerm.*', '000001.SZ', '20260620', '20260621', 10, '20260625', 10.22, 2.2, 2.1, 2.1, 'hold_expired', 'executed', 88, JSON.stringify({ stockName: '平安银行' }))
    const insertAuction = db.prepare(
      "INSERT OR REPLACE INTO stk_auction_backtest_detail (trade_date, ts_code, pool, buy_price, ret_1d, ret_2d, ret_3d, ret_5d, computed_at, is_one_word, idx_ret1d, idx_ret2d, idx_ret3d, idx_ret5d) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)"
    )
    insertAuction.run('20260710', '000001.SZ', 'firstBoard', 10, 1, 2, 3, 5, Date.now(), 0.5, 1, 1.5, 2)
    insertAuction.run('20260711', '000002.SZ', 'firstBoard', 20, -1, -2, -3, -5, Date.now(), 0.5, 1, 1.5, 2)
    db.prepare('INSERT OR REPLACE INTO stock_info (stockCode, stockName, fetchedAt) VALUES (?, ?, ?)').run('000002', '万科A', Date.now())
    const now = Date.now()
    const strategyInfo = db.prepare(
      "INSERT INTO strategy_lab_strategies (strategy_key, name, description, source, status, enabled, is_builtin, version, rule_draft_json, run_config_json, actions_json, last_run_at, created_at, updated_at) VALUES ('e2e-alpha', '测试强势策略', '真实命中后的多周期收益样本', 'screener', 'ready', 1, 0, 2, '{}', '{}', '{}', ?, ?, ?)"
    ).run(now, now, now)
    const strategyId = Number(strategyInfo.lastInsertRowid)
    const runInfo = db.prepare(
      "INSERT INTO strategy_lab_runs (strategy_id, strategy_key, strategy_name, source, status, date_start, date_end, run_config_json, summary_json, created_at, started_at, completed_at) VALUES (?, 'e2e-alpha', '测试强势策略', 'screener', 'completed', '20260710', '20260710', ?, '{}', ?, ?, ?)"
    ).run(strategyId, JSON.stringify({ strategyVersion: 2 }), now, now, now)
    const strategyRunId = Number(runInfo.lastInsertRowid)
    db.prepare(
      "INSERT INTO strategy_lab_matches (run_id, strategy_id, strategy_key, source, ts_code, stock_name, trade_date, score, signal_strength, matched_from, evidence_json, action_json, created_at) VALUES (?, ?, 'e2e-alpha', 'screener', '600000.SH', '浦发银行', '20260710', 88, 88, 'screener', '{}', '{}', ?)"
    ).run(strategyRunId, strategyId, now)
    const insertDaily = db.prepare(
      "INSERT OR REPLACE INTO daily_close_cache (ts_code, trade_date, open, high, low, close, pct_chg, vol, turnover_rate) VALUES (?, ?, ?, ?, ?, ?, 0, 1000, 1)"
    )
    const stockRows = [['20260713', 10, 10.5], ['20260714', 10.5, 11], ['20260715', 11, 12], ['20260716', 12, 11], ['20260717', 11, 13]]
    const auctionStockRows = [['20260710', 10, 10.1], ['20260711', 10.2, 10.5], ['20260714', 10.5, 10.8], ['20260715', 10.8, 11], ['20260716', 11, 11.2], ['20260717', 11.2, 11.4]]
    const indexRows = [['20260713', 100, 101], ['20260714', 101, 102], ['20260715', 102, 103], ['20260716', 103, 104], ['20260717', 104, 105]]
    for (const [date, open, close] of stockRows) insertDaily.run('600000.SH', date, open, Math.max(open, close), Math.min(open, close), close)
    for (const [date, open, close] of auctionStockRows) {
      insertDaily.run('000001.SZ', date, open, Math.max(open, close), Math.min(open, close), close)
      insertDaily.run('000002.SZ', date, open * 2, Math.max(open, close) * 2, Math.min(open, close) * 2, close * 2)
    }
    for (const [date, open, close] of indexRows) insertDaily.run('000001.SH', date, open, Math.max(open, close), Math.min(open, close), close)
    db.close()
  `, { TRADE_WATCH_SEED_DB: dbPath })
}
