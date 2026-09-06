/**
 * 通用日线 DSL（F1）— 类型与参数定义。
 * 与分钟 ConditionBlockType 并行，禁止混入分钟积木联合类型。
 */

export type DailyDslBlockType =
  | 'daily_pct_chg'
  | 'daily_ma_cross'
  | 'daily_volume_ratio'
  | 'daily_turnover_min'

export type DailyDslGroupOperator = 'AND' | 'OR' | 'NOT'
export type DailyDslExecutionMode = 'strict' | 'score'
export type DailyDslDataStatus = 'complete' | 'partial' | 'data_insufficient'

export interface DailyDslParameterDefinition {
  key: string
  label: string
  unit?: string
  min?: number
  max?: number
  step?: number
  defaultValue: number | string | boolean
}

export interface DailyDslBlock {
  id: string
  type: DailyDslBlockType
  name: string
  description: string
  enabled: boolean
  weight: number
  hardRequired?: boolean
  params: Record<string, number | string | boolean>
}

export interface DailyDslGroup {
  id: string
  operator: DailyDslGroupOperator
  enabled: boolean
  children: Array<DailyDslGroup | DailyDslBlock>
}

export interface DailyDslTemplate {
  key: string
  name: string
  description: string
  version: number
  enabled: boolean
  executionMode: DailyDslExecutionMode
  scoreThreshold: number
  root: DailyDslGroup
}

export interface DailyDslConditionEvaluationResult {
  blockId: string
  type: DailyDslBlockType
  name: string
  passed: boolean
  score: number
  weight: number
  contribution: number
  params: Record<string, number | string | boolean>
  hardRequired: boolean
  dataStatus: DailyDslDataStatus
  message: string
  evidence: Record<string, unknown>
}

export interface DailyDslGroupEvaluationResult {
  groupId: string
  operator: DailyDslGroupOperator
  passed: boolean
  score: number
  maxScore: number
  dataStatus: DailyDslDataStatus
  conditions: DailyDslConditionEvaluationResult[]
  groups: DailyDslGroupEvaluationResult[]
}

export interface DailyDslEvaluationResult {
  passed: boolean
  totalScore: number
  maxScore: number
  dataStatus: DailyDslDataStatus
  summary: string
  root: DailyDslGroupEvaluationResult
  flatConditions: DailyDslConditionEvaluationResult[]
}

/** 日线求值用 bar（与 DailyRow 字段对齐，close 可空以便标不足）。 */
export interface DailyDslBar {
  tradeDate: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  pctChg: number | null
  vol: number | null
  turnoverRate: number | null
}

export const DAILY_DSL_PARAMETER_DEFS: Record<DailyDslBlockType, DailyDslParameterDefinition[]> = {
  daily_pct_chg: [
    { key: 'lookbackDays', label: '回看交易日', unit: '日', min: 1, max: 60, step: 1, defaultValue: 5 },
    { key: 'minPctChg', label: '最低累计涨跌幅', unit: '%', min: -50, max: 100, step: 0.1, defaultValue: 3 },
  ],
  daily_ma_cross: [
    { key: 'maPeriod', label: '均线周期', unit: '日', min: 2, max: 120, step: 1, defaultValue: 20 },
    { key: 'side', label: '相对均线', defaultValue: 'above' },
  ],
  daily_volume_ratio: [
    { key: 'baselineDays', label: '均量基准日', unit: '日', min: 2, max: 60, step: 1, defaultValue: 5 },
    { key: 'minRatio', label: '最低量比', min: 0.1, max: 20, step: 0.1, defaultValue: 1.5 },
  ],
  daily_turnover_min: [
    { key: 'minTurnoverRate', label: '最低换手率', unit: '%', min: 0, max: 50, step: 0.1, defaultValue: 1 },
  ],
}

export function isDailyDslBlock(node: DailyDslGroup | DailyDslBlock): node is DailyDslBlock {
  return 'type' in node && typeof (node as DailyDslBlock).type === 'string'
}

export function createDefaultDailyDslTemplate(): DailyDslTemplate {
  return {
    key: 'daily_dsl_default',
    name: '日线 DSL 默认',
    description: '近5日涨幅≥3% 且 收盘站上20日均线（示例模板，可改）',
    version: 1,
    enabled: true,
    executionMode: 'strict',
    scoreThreshold: 60,
    root: {
      id: 'root',
      operator: 'AND',
      enabled: true,
      children: [
        {
          id: 'pct',
          type: 'daily_pct_chg',
          name: '近5日涨幅',
          description: '累计涨跌幅下限',
          enabled: true,
          weight: 50,
          hardRequired: true,
          params: { lookbackDays: 5, minPctChg: 3 },
        },
        {
          id: 'ma',
          type: 'daily_ma_cross',
          name: '站上均线',
          description: '收盘相对 SMA',
          enabled: true,
          weight: 50,
          params: { maPeriod: 20, side: 'above' },
        },
      ],
    },
  }
}
