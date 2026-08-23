import { runElectronScript } from './screenshotDemoSeed'

/** E2E 产业图谱演示数据（与 industry-research-graph-workbench 一致）。 */
export function seedGraphFixture(dbPath: string): void {
  runElectronScript(String.raw`
    const Database = require('better-sqlite3')
    const db = new Database(process.env.TRADE_WATCH_SEED_DB)
    db.pragma('foreign_keys = ON')
    const now = Date.now()
    const projectId = 'e2e-graph-project'
    db.prepare(
      'INSERT INTO industry_research_projects (id, title, industry_name, product_scope, region_scope, time_scope, purpose, depth, status, data_as_of, source_type, source_ref, source_text_summary, skill_id, skill_content_hash, skill_rule_version, generation_model, graph_updated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(projectId, '光通信产业传导图验收', '光通信', '光纤光缆与承载网络', '中国', '近三年', 'investment', 'standard', 'active', '2026-07-18', 'manual', null, 'E2E graph fixture', 'builtin:industry-chain-research', 'a'.repeat(64), 'sha256:aaaaaaaaaaaa', 'e2e-model', now, now, now)
    db.prepare(
      'INSERT INTO industry_research_generation_runs (id, project_id, research_question, status, current_stage, last_successful_stage, progress_current, progress_total, progress_message, cancel_requested, skill_id, skill_content_hash, skill_rule_version, provider, model, error_code, error_message, retryable, stage_artifacts_json, scope_json, enable_web_retrieval, created_at, started_at, completed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      'e2e-company-coverage-run', projectId, '验证公司生态位覆盖补全入口。', 'succeeded', 'report', 'report',
      7, 7, '研究报告已生成', 0, 'builtin:industry-chain-research', 'a'.repeat(64), 'sha256:aaaaaaaaaaaa',
      'e2e-provider', 'e2e-model', null, null, 0,
      JSON.stringify({ scope: { purpose: 'investment' }, map: { nodes: [], edges: [] }, companies: { items: [] } }),
      JSON.stringify({ purpose: 'investment' }), 1, now, now, now, now,
    )
    const layerSizes = [5, 4, 8, 13, 6, 3, 3, 3, 3]
    const layerNames = layerSizes.map((size, layer) => Array.from({ length: size }, (_, index) => (
      layer === 3 && index === 0 ? '深南电路'
        : layer === 3 && index === 1 ? '高速交换机与网络设备订单持续性验证'
        : layer === 4 && index === 0 ? '常规电子电路铜箔'
        : '产业节点 ' + layer + '-' + index
    )))
    const layerTypes = ['material', 'equipment', 'product', 'company', 'material', 'product', 'demand', 'demand', 'demand']
    const layerStages = ['上游', '设备与支撑', '中游', '下游公司', '上游材料', '中游', '下游', '终端需求', '终端需求']
    const nodes = layerNames.flatMap((names, layer) => names.map((name, index) => [
      'node:l' + layer + '-' + index, name, layerTypes[layer], layerStages[layer],
      index % 3 === 0 ? 'fact' : 'estimate',
      index === 12 && layer === 3 ? 'no_evidence_support' : 'active',
      index === 0 && layer === 2 ? '[{"name":"利用率","value":82,"unit":"%"}]' : '[]',
      index === 0 ? '["evidence:official-0"]' : '[]',
    ]))
    const insertNode = db.prepare('INSERT INTO industry_research_nodes (id, project_id, type, name, stage, statement_kind, status, metrics_json, evidence_ids_json, last_updated, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (const [id, name, type, stage, kind, status, metrics, evidenceIds] of nodes) {
      insertNode.run(id, projectId, type, name, stage, kind, status, metrics, evidenceIds, '2026-07-18', now, now)
    }
    const edges = []
    const relations = ['原料供给', '产能转化', '产品交付', '业务暴露', '加工为', '需求传导', '需求传导', '需求传导']
    for (let layer = 0; layer < layerSizes.length - 1; layer += 1) {
      for (let index = 0; index < layerSizes[layer + 1]; index += 1) {
        edges.push(['main-' + layer + '-' + index, 'l' + layer + '-' + (index % layerSizes[layer]), 'l' + (layer + 1) + '-' + index, relations[layer], index === 0 && layer === 1 ? 1 : 0])
      }
    }
    for (let index = 0; index < 12; index += 1) {
      const layer = index % (layerSizes.length - 1)
      edges.push(['cross-' + index, 'l' + layer + '-' + (index % layerSizes[layer]), 'l' + (layer + 1) + '-' + ((index + 2) % layerSizes[layer + 1]), '交叉传导 ' + (index + 1), index % 7 === 0 ? 1 : 0])
    }
    const insertEdge = db.prepare('INSERT INTO industry_research_edges (id, project_id, source_node_id, target_node_id, relation, statement_kind, strength, bottleneck, exposure_pct, evidence_ids_json, last_updated, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (const [id, source, target, relation, bottleneck] of edges) {
      insertEdge.run('edge:' + id, projectId, 'node:' + source, 'node:' + target, relation, bottleneck ? 'fact' : 'estimate', bottleneck ? 0.9 : 0.7, bottleneck, null, bottleneck ? '["evidence:official"]' : '[]', '2026-07-18', now, now)
    }
    const insertEvidence = db.prepare('INSERT INTO industry_research_evidence (id, project_id, title, source_type, source_name, source_url, source_ref, published_date, fact_date, collected_at, metric_name, metric_value, unit, region, product_spec, methodology, statement_kind, direction, reliability, created_by, primary_source_confirmed, conflict_note, excerpt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (let index = 0; index < 18; index += 1) {
      insertEvidence.run('evidence:official-' + index, projectId, '运营商光缆集采结果 ' + (index + 1), 'official', '运营商公告', 'https://example.com/procurement/' + index, null, '2026-07-18', '2026-07-18', now, null, null, null, '中国', '普通单模光纤', null, 'fact', 'support', 'primary', 'human', 1, null, '集采数量与中标份额用于验证下游需求。', now, now)
    }
    const insertHypothesis = db.prepare('INSERT INTO industry_research_hypotheses (id, project_id, statement, importance, status, cheapest_disproof, verification_metric, threshold, due_at, evidence_ids_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const insertHypothesisEvent = db.prepare('INSERT INTO industry_research_hypothesis_events (id, project_id, hypothesis_id, from_status, to_status, reason, evidence_ids_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    for (let index = 0; index < 2; index += 1) {
      const hypothesisId = 'hypothesis:demand-' + index
      insertHypothesis.run(hypothesisId, projectId, '运营商集采需求将持续改善 ' + (index + 1), index + 1, 'open', '下一轮集采量价同时下降。', '集采数量与中标价', '同比下降', null, '[]', now, now)
      insertHypothesisEvent.run('event:hypothesis-demand-' + index, projectId, hypothesisId, null, 'open', 'E2E initial hypothesis', '[]', now)
    }
    const companyFixtures = [
      ['company:score-low', '低分光通信', '600001.SH', 35],
      ['company:score-unknown', '待评分光通信', '600002.SH', null],
      ['company:score-high', '高分光通信', '600003.SH', 82],
    ]
    const insertCompany = db.prepare('INSERT INTO industry_research_companies (id, legal_name, short_name, source_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    const insertSecurity = db.prepare('INSERT INTO industry_research_securities (id, company_id, ts_code, symbol, exchange, security_type, list_status, mapping_source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const insertProjectCompany = db.prepare('INSERT INTO industry_research_project_companies (project_id, company_id, status, evidence_ids_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    const insertTrendScore = db.prepare('INSERT INTO trend_scores (ts_code, trade_date, ma_score, ma_above_60, alpha_score, drawdown, turnover_ratio, macd_above_zero, boll_above_mid, total_score, computed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (const [companyId, companyName, tsCode, totalScore] of companyFixtures) {
      insertCompany.run(companyId, companyName, companyName, 'manual', now, now)
      insertSecurity.run('security:' + companyId, companyId, tsCode, tsCode.slice(0, 6), 'SSE', 'stock', 'L', 'manual', now, now)
      insertProjectCompany.run(projectId, companyId, 'candidate', '[]', now, now)
      if (totalScore != null) insertTrendScore.run(tsCode, '20260717', 50, 1, 50, 5, 1.2, 1, 1, totalScore, now)
    }
    db.close()
  `, { TRADE_WATCH_SEED_DB: dbPath })
}
