import { describe, expect, it } from 'vitest'
import { createDefaultDailyDslTemplate } from '../../electron/main/services/dailyDsl/types'
import type { DailyDslTemplate } from '../../electron/main/services/dailyDsl/types'
import { DEFAULT_CONDITION_BLOCK_TEMPLATES } from '../../electron/main/services/conditionBlocks/defaultTemplates'
import type { StrategyLabStrategyDetail } from '../../electron/main/services/strategyLabService'
import {
  buildDslStateFromDetail,
  buildDslStateFromSnapshot,
  buildSavePayload,
  buildSaveDslProfileSnapshot,
  summarizeDailyDslGroup,
  validateDslTemplate,
} from '../../src/components/ShortTermStrategy/StrategyLab/dailyDslRuleModel'

function templateWith(overrides: Partial<DailyDslTemplate>): DailyDslTemplate {
  return { ...createDefaultDailyDslTemplate(), ...overrides }
}

describe('dailyDslRuleModel', () => {
  it('buildDslStateFromSnapshot：无快照时回退默认模板', () => {
    const state = buildDslStateFromSnapshot(undefined)
    expect(state.template.executionMode).toBe('strict')
    expect(state.template.root.children.length).toBeGreaterThanOrEqual(2)
  })

  it('buildDslStateFromSnapshot：快照参数原样载入（含非默认参数）', () => {
    const snapshot = createDefaultDailyDslTemplate()
    snapshot.executionMode = 'score'
    snapshot.scoreThreshold = 72
    const pct = snapshot.root.children[0]
    if (!('type' in pct)) throw new Error('expected block')
    pct.params = { lookbackDays: 10, minPctChg: 5.5 }
    const state = buildDslStateFromSnapshot(snapshot)
    expect(state.template.executionMode).toBe('score')
    expect(state.template.scoreThreshold).toBe(72)
    const loadedPct = state.template.root.children[0]
    expect('type' in loadedPct && loadedPct.params).toEqual({ lookbackDays: 10, minPctChg: 5.5 })
  })

  it('validateDslTemplate：启用条件至少一个', () => {
    const t = createDefaultDailyDslTemplate()
    for (const child of t.root.children) {
      if ('type' in child) child.enabled = false
    }
    expect(validateDslTemplate(t)).toContain('至少启用一个日线条件。')
  })

  it('validateDslTemplate：score 模式阈值 0-100', () => {
    const t = templateWith({ executionMode: 'score', scoreThreshold: 120 })
    expect(validateDslTemplate(t).some(m => m.includes('阈值'))).toBe(true)
  })

  it('validateDslTemplate：参数按 def 夹取 min/max 提示', () => {
    const t = createDefaultDailyDslTemplate()
    const pct = t.root.children[0]
    if (!('type' in pct)) throw new Error('expected block')
    pct.params = { lookbackDays: 0, minPctChg: 3 }
    const errors = validateDslTemplate(t)
    expect(errors.some(m => m.includes('回看交易日'))).toBe(true)
  })

  it('summarizeDailyDslGroup：输出关键参数摘要', () => {
    const t = createDefaultDailyDslTemplate()
    const summary = summarizeDailyDslGroup(t.root)
    expect(summary).toContain('近5日涨幅')
    expect(summary).toContain('站上均线')
  })

  it('buildSaveDslProfileSnapshot：回写模板与 name/description', () => {
    const t = createDefaultDailyDslTemplate()
    const snapshot = buildSaveDslProfileSnapshot(t, '我的日线策略', '说明文字')
    expect(snapshot.name).toBe('我的日线策略')
    expect(snapshot.description).toBe('说明文字')
    expect(snapshot.root.children.length).toBeGreaterThanOrEqual(2)
  })

  function makeDetail(source: 'dailyDsl' | 'twoPhase', snapshot?: DailyDslTemplate): StrategyLabStrategyDetail {
    const isTwoPhase = source === 'twoPhase'
    return {
      id: 7,
      name: '日线示例',
      description: '示例',
      source: 'custom',
      status: 'draft',
      enabled: true,
      isBuiltin: false,
      ruleDraft: {
        schemaVersion: 1,
        source: 'custom',
        stockPool: { sources: ['allMarket'], manualTsCodes: [], excludeST: true, excludeBJ: false },
        dailyDslProfile: { enabled: true, templateSnapshot: snapshot ?? createDefaultDailyDslTemplate() },
        conditionBlocksProfile: isTwoPhase
          ? { enabled: true, templateKey: 'intraday_amount_surge_hold', templateId: null, templateVersion: DEFAULT_CONDITION_BLOCK_TEMPLATES[0].version, templateSnapshot: JSON.parse(JSON.stringify(DEFAULT_CONDITION_BLOCK_TEMPLATES[0])) }
          : { enabled: false, templateKey: 'intraday_amount_surge_hold', templateId: null },
        scoring: { minScore: 60, weights: { dailyDslScore: 100 } },
      },
      runConfig: {
        scanMode: isTwoPhase ? 'twoPhase' : 'complete',
        lookbackDays: 5,
        dailyPrefilterLimit: 200,
        autoFetchMinuteLimit: 80,
        userTier: 'free',
        dateStart: null,
        dateEnd: null,
      },
      actions: { aiInsight: true, addToTrendWatchlist: true, monitorChips: false, createBacktest: false },
    } as unknown as StrategyLabStrategyDetail
  }

  it('buildDslStateFromDetail：dailyDsl 快照参数原样载入，非默认模板兜底', () => {
    const snapshot = createDefaultDailyDslTemplate()
    const pct = snapshot.root.children[0]
    if (!('type' in pct)) throw new Error('expected block')
    pct.params = { lookbackDays: 9, minPctChg: 4.5 }
    const detail = makeDetail('dailyDsl', snapshot)
    const state = buildDslStateFromDetail(detail)
    expect(state.kind).toBe('dailyDsl')
    const loaded = state.dslTemplate.root.children[0]
    expect('type' in loaded && loaded.params).toEqual({ lookbackDays: 9, minPctChg: 4.5 })
  })

  it('buildDslStateFromDetail：twoPhase 保留分钟模板与 DSL 双快照', () => {
    const detail = makeDetail('twoPhase')
    const state = buildDslStateFromDetail(detail)
    expect(state.kind).toBe('twoPhase')
    expect(state.minuteTemplate).not.toBeNull()
    expect(state.dslTemplate.root.children.length).toBeGreaterThanOrEqual(2)
  })

  it('buildSavePayload：dailyDsl 保留 custom source 与 dailyDslProfile，分钟 profile 置 disabled', () => {
    const detail = makeDetail('dailyDsl')
    const state = buildDslStateFromDetail(detail)
    const payload = buildSavePayload(state, { editingId: 7, runAfterSave: false })
    expect(payload.id).toBe(7)
    expect(payload.source).toBe('custom')
    expect(payload.ruleDraft.source).toBe('custom')
    expect(payload.ruleDraft.dailyDslProfile?.enabled).toBe(true)
    expect(payload.ruleDraft.conditionBlocksProfile?.enabled).toBe(false)
    expect(payload.ruleDraft.dailyDslProfile?.templateSnapshot.name).toBe(state.name)
  })

  it('buildSavePayload：twoPhase 保留双 profile 且 scanMode=twoPhase', () => {
    const detail = makeDetail('twoPhase')
    const state = buildDslStateFromDetail(detail)
    const payload = buildSavePayload(state, { editingId: 7, runAfterSave: true })
    expect(payload.source).toBe('custom')
    expect(payload.status).toBe('ready')
    expect(payload.runConfig.scanMode).toBe('twoPhase')
    expect(payload.ruleDraft.dailyDslProfile?.enabled).toBe(true)
    expect(payload.ruleDraft.conditionBlocksProfile?.enabled).toBe(true)
  })
})
