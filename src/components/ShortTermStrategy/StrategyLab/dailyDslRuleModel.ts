import {
  DAILY_DSL_PARAMETER_DEFS,
  createDefaultDailyDslTemplate,
  isDailyDslBlock,
  type DailyDslBlock,
  type DailyDslBlockType,
  type DailyDslGroup,
  type DailyDslGroupOperator,
  type DailyDslTemplate,
} from '../../../../electron/main/services/dailyDsl/types'
import type {
  StrategyLabRuleDraft,
  StrategyLabScanMode,
  StrategyLabStockPoolSource,
  StrategyLabStrategyDetail,
} from '../../../../electron/main/services/strategyLabService'

export interface DslCatalogItem {
  type: DailyDslBlockType
  name: string
  description: string
}

export const DSL_CATALOG: DslCatalogItem[] = [
  { type: 'daily_pct_chg', name: '近N日涨幅', description: '最近 N 个交易日累计涨跌幅限制。' },
  { type: 'daily_ma_cross', name: '站上均线', description: '收盘价相对简单均线位置。' },
  { type: 'daily_volume_ratio', name: '放量倍数', description: '当日量相对前 N 日均量的放大倍数。' },
  { type: 'daily_turnover_min', name: '换手下限', description: '换手率下限（代理指标）。' },
]

export const DSL_SIDE_OPTIONS = [
  { value: 'above', label: '站上' },
  { value: 'below', label: '跌破' },
] as const

const CATALOG_MAP = new Map(DSL_CATALOG.map(item => [item.type, item]))

function makeId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${random}`
}

export function cloneDslTemplate(template: DailyDslTemplate): DailyDslTemplate {
  return JSON.parse(JSON.stringify(template)) as DailyDslTemplate
}

export interface DslBuilderState {
  template: DailyDslTemplate
}

export function buildDslStateFromSnapshot(snapshot?: DailyDslTemplate | null): DslBuilderState {
  const base = snapshot ? cloneDslTemplate(snapshot) : createDefaultDailyDslTemplate()
  return { template: base }
}

export function createDefaultDslGroup(operator: DailyDslGroupOperator = 'AND'): DailyDslGroup {
  return { id: makeId('dsl-group'), operator, enabled: true, children: [] }
}

export function createDslBlock(type: DailyDslBlockType): DailyDslBlock {
  const catalog = CATALOG_MAP.get(type) ?? DSL_CATALOG[0]
  const params: Record<string, number | string | boolean> = {}
  for (const def of DAILY_DSL_PARAMETER_DEFS[catalog.type] ?? []) {
    params[def.key] = def.defaultValue
  }
  return {
    id: makeId('dsl-block'),
    type: catalog.type,
    name: catalog.name,
    description: catalog.description,
    enabled: true,
    weight: 50,
    params,
  }
}

export function summarizeDslBlock(block: DailyDslBlock): string {
  const parts: string[] = []
  for (const def of DAILY_DSL_PARAMETER_DEFS[block.type] ?? []) {
    const value = block.params[def.key]
    if (value === undefined) continue
    if (def.key === 'side') {
      const hit = DSL_SIDE_OPTIONS.find(opt => opt.value === String(value))
      parts.push(`${def.label}=${hit?.label ?? value}`)
    } else if (typeof def.defaultValue === 'boolean') {
      parts.push(`${def.label}=${value ? '是' : '否'}`)
    } else {
      parts.push(`${def.label}=${value}${def.unit ?? ''}`)
    }
  }
  return parts.join('，') || '默认参数'
}

function mapDslGroup(
  group: DailyDslGroup,
  mapper: (block: DailyDslBlock) => DailyDslBlock,
): DailyDslGroup {
  return {
    ...group,
    children: group.children.map(child => {
      if (isDailyDslBlock(child)) return mapper(child)
      return mapDslGroup(child, mapper)
    }),
  }
}

export function updateDslBlock(
  root: DailyDslGroup,
  blockId: string,
  patch: Partial<DailyDslBlock>,
): DailyDslGroup {
  return mapDslGroup(root, block => (block.id === blockId ? { ...block, ...patch, params: patch.params ?? block.params } : block))
}

export function updateDslTemplate(
  template: DailyDslTemplate,
  patch: Partial<Pick<DailyDslTemplate, 'executionMode' | 'scoreThreshold' | 'root' | 'name' | 'description'>>,
): DailyDslTemplate {
  return { ...template, ...patch }
}

/** 按 detail 的 profile / scanMode 判定 UI kind（DB source 仍为 custom）。 */
export function resolveRuleKind(detail: StrategyLabStrategyDetail): StrategyRuleKind | 'minute' | 'screener' {
  if (detail.source === 'screener') return 'screener'
  if (detail.source === 'conditionBlocks') return 'minute'
  const dslOn = detail.ruleDraft.dailyDslProfile?.enabled === true
  const minuteOn = detail.ruleDraft.conditionBlocksProfile?.enabled === true
  if (dslOn && (minuteOn || detail.runConfig.scanMode === 'twoPhase')) return 'twoPhase'
  if (dslOn) return 'dailyDsl'
  return 'minute'
}

export function summarizeDailyDslGroup(group: DailyDslGroup): string {
  const parts: string[] = []
  for (const child of group.children) {
    if (isDailyDslBlock(child)) {
      if (child.enabled) parts.push(child.name)
    } else {
      parts.push(summarizeDailyDslGroup(child))
    }
  }
  return parts.filter(Boolean).join(' + ') || '（未配置条件）'
}

export function countEnabledDslBlocks(group: DailyDslGroup): number {
  let count = 0
  for (const child of group.children) {
    if (isDailyDslBlock(child)) {
      if (child.enabled) count += 1
    } else {
      count += countEnabledDslBlocks(child)
    }
  }
  return count
}

export function validateDslTemplate(template: DailyDslTemplate): string[] {
  const errors: string[] = []
  if (template.executionMode === 'score') {
    const threshold = template.scoreThreshold
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      errors.push('评分模式阈值需在 0-100 之间。')
    }
  }
  if (countEnabledDslBlocks(template.root) === 0) {
    errors.push('至少启用一个日线条件。')
  }
  const walk = (group: DailyDslGroup): void => {
    for (const child of group.children) {
      if (isDailyDslBlock(child)) {
        if (!child.enabled) continue
        for (const def of DAILY_DSL_PARAMETER_DEFS[child.type] ?? []) {
          if (typeof def.defaultValue === 'boolean' || def.key === 'side') continue
          const raw = child.params[def.key]
          const value = Number(raw)
          if (!Number.isFinite(value)) {
            errors.push(`「${child.name}」${def.label} 需为数字。`)
            continue
          }
          if (def.min !== undefined && value < def.min) {
            errors.push(`「${child.name}」${def.label} 不能小于 ${def.min}。`)
          }
          if (def.max !== undefined && value > def.max) {
            errors.push(`「${child.name}」${def.label} 不能大于 ${def.max}。`)
          }
        }
      } else {
        walk(child)
      }
    }
  }
  walk(template.root)
  return errors
}

export function buildSaveDslProfileSnapshot(
  template: DailyDslTemplate,
  name: string,
  description: string,
): DailyDslTemplate {
  const snapshot = cloneDslTemplate(template)
  snapshot.name = name
  snapshot.description = description
  return snapshot
}

export type StrategyRuleKind = 'minute' | 'dailyDsl' | 'twoPhase'

export interface DslDetailState {
  kind: StrategyRuleKind
  name: string
  description: string
  dslTemplate: DailyDslTemplate
  minuteTemplate: import('../../../../electron/main/services/conditionBlocks/types').BlockStrategyTemplate | null
  sources: StrategyLabStockPoolSource[]
  manualStocks: string
  excludeST: boolean
  excludeBJ: boolean
  scanMode: StrategyLabScanMode
  lookbackDays: number
  dailyPrefilterLimit: number
  autoFetchMinuteLimit: number
  dateStart: string
  dateEnd: string
}

/** 止损：从 detail 构建 DSL 编辑态，绝不回退为分钟模板。 */
export function buildDslStateFromDetail(detail: StrategyLabStrategyDetail): DslDetailState {
  const resolved = resolveRuleKind(detail)
  const kind: StrategyRuleKind = resolved === 'twoPhase' ? 'twoPhase' : 'dailyDsl'
  const snapshot = detail.ruleDraft.dailyDslProfile?.templateSnapshot
  const dslTemplate = snapshot ? cloneDslTemplate(snapshot) : createDefaultDailyDslTemplate()
  const minuteTemplate = detail.ruleDraft.conditionBlocksProfile?.templateSnapshot
    ? (JSON.parse(JSON.stringify(detail.ruleDraft.conditionBlocksProfile.templateSnapshot)) as DslDetailState['minuteTemplate'])
    : null
  return {
    kind,
    name: detail.name,
    description: detail.description ?? dslTemplate.description,
    dslTemplate,
    minuteTemplate,
    sources: detail.ruleDraft.stockPool.sources,
    manualStocks: detail.ruleDraft.stockPool.manualTsCodes.join(' '),
    excludeST: detail.ruleDraft.stockPool.excludeST,
    excludeBJ: detail.ruleDraft.stockPool.excludeBJ,
    scanMode: detail.runConfig.scanMode,
    lookbackDays: detail.runConfig.lookbackDays,
    dailyPrefilterLimit: detail.runConfig.dailyPrefilterLimit,
    autoFetchMinuteLimit: detail.runConfig.autoFetchMinuteLimit,
    dateStart: detail.runConfig.dateStart ?? '',
    dateEnd: detail.runConfig.dateEnd ?? '',
  }
}

export interface SavePayloadOptions {
  editingId: number | null
  runAfterSave: boolean
}

/** 保存入参：DB source 固定 custom；靠 profile/scanMode 区分日线与两阶段。 */
export function buildSavePayload(state: DslDetailState, options: SavePayloadOptions) {
  const dslSnapshot = buildSaveDslProfileSnapshot(state.dslTemplate, state.name.trim(), state.description.trim())
  const stockPool = {
    sources: state.sources,
    manualTsCodes: state.manualStocks.split(/[\s,，;；]+/).map(s => s.trim().toUpperCase()).filter(Boolean),
    excludeST: state.excludeST,
    excludeBJ: state.excludeBJ,
  }
  const isTwoPhase = state.kind === 'twoPhase'
  const scanMode: StrategyLabScanMode = isTwoPhase ? 'twoPhase' : (state.scanMode === 'quick' ? 'quick' : 'complete')
  const ruleDraft: StrategyLabRuleDraft = {
    schemaVersion: 1,
    source: 'custom',
    stockPool,
    dailyDslProfile: { enabled: true, templateSnapshot: dslSnapshot },
    conditionBlocksProfile: isTwoPhase && state.minuteTemplate
      ? {
          enabled: true,
          templateKey: state.minuteTemplate.key,
          templateId: null,
          templateVersion: state.minuteTemplate.version,
          templateSnapshot: state.minuteTemplate,
        }
      : { enabled: false, templateKey: state.minuteTemplate?.key ?? 'intraday_amount_surge_hold', templateId: null },
    scoring: {
      minScore: isTwoPhase ? 70 : dslSnapshot.scoreThreshold,
      weights: isTwoPhase ? { dailyDslScore: 40, conditionScore: 60 } : { dailyDslScore: 100 },
    },
  }
  return {
    id: options.editingId ?? undefined,
    name: state.name.trim(),
    description: state.description.trim(),
    source: 'custom' as const,
    status: options.runAfterSave ? ('ready' as const) : ('draft' as const),
    enabled: true,
    ruleDraft,
    runConfig: {
      scanMode,
      lookbackDays: state.lookbackDays,
      dailyPrefilterLimit: state.dailyPrefilterLimit,
      autoFetchMinuteLimit: state.autoFetchMinuteLimit,
      userTier: 'free' as const,
      dateStart: state.dateStart || null,
      dateEnd: state.dateEnd || null,
    },
  }
}
