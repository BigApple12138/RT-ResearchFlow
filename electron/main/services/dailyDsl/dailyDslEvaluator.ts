import type {
  DailyDslBar,
  DailyDslBlock,
  DailyDslConditionEvaluationResult,
  DailyDslDataStatus,
  DailyDslEvaluationResult,
  DailyDslGroup,
  DailyDslGroupEvaluationResult,
  DailyDslTemplate,
} from './types'
import { isDailyDslBlock } from './types'
import { evaluateDailyCondition, sliceBarsAsOf } from './dailyConditions'

function mergeStatus(items: Array<{ dataStatus: DailyDslDataStatus }>): DailyDslDataStatus {
  if (items.some((item) => item.dataStatus === 'data_insufficient')) return 'data_insufficient'
  if (items.some((item) => item.dataStatus === 'partial')) return 'partial'
  return 'complete'
}

function flatten(group: DailyDslGroupEvaluationResult): DailyDslConditionEvaluationResult[] {
  return [...group.conditions, ...group.groups.flatMap(flatten)]
}

function hasHardRequiredFailure(group: DailyDslGroupEvaluationResult): boolean {
  return group.conditions.some((item) => item.hardRequired && !item.passed)
    || group.groups.some(hasHardRequiredFailure)
}

function evalGroup(
  group: DailyDslGroup,
  bars: DailyDslBar[],
  mode: DailyDslTemplate['executionMode'],
  threshold: number,
): DailyDslGroupEvaluationResult {
  if (!group.enabled) {
    return {
      groupId: group.id,
      operator: group.operator,
      passed: true,
      score: 0,
      maxScore: 0,
      dataStatus: 'complete',
      conditions: [],
      groups: [],
    }
  }
  const conditions: DailyDslConditionEvaluationResult[] = []
  const groups: DailyDslGroupEvaluationResult[] = []
  for (const child of group.children) {
    if (!child.enabled) continue
    if (isDailyDslBlock(child)) conditions.push(evaluateDailyCondition(child as DailyDslBlock, bars))
    else groups.push(evalGroup(child, bars, mode, threshold))
  }
  const childPasses = [...conditions.map((item) => item.passed), ...groups.map((item) => item.passed)]
  const hardFailed = conditions.some((item) => item.hardRequired && !item.passed)
    || groups.some(hasHardRequiredFailure)
  const operatorPass = group.operator === 'AND'
    ? childPasses.every(Boolean)
    : group.operator === 'OR'
      ? childPasses.some(Boolean)
      : !childPasses.some(Boolean)
  const maxScore = conditions.reduce((sum, item) => sum + item.weight, 0)
    + groups.reduce((sum, item) => sum + item.maxScore, 0)
  const rawScore = conditions.reduce((sum, item) => sum + item.contribution, 0)
    + groups.reduce((sum, item) => sum + (item.score / 100) * item.maxScore, 0)
  const weightedScore = maxScore > 0 ? Math.min(100, (rawScore / maxScore) * 100) : operatorPass ? 100 : 0
  const childScores = [
    ...conditions.map((item) => (item.weight > 0 ? (item.contribution / item.weight) * 100 : item.passed ? 100 : 0)),
    ...groups.map((item) => item.score),
  ]
  const score = group.operator === 'OR'
    ? Math.max(0, ...childScores, 0)
    : group.operator === 'NOT'
      ? operatorPass ? 100 : 0
      : weightedScore
  const dataStatus = mergeStatus([...conditions, ...groups])
  const dataBlocked = dataStatus === 'data_insufficient'
  // 缺数据不作 NOT 反证：dataBlocked 时 NOT 也失败
  const passed = !dataBlocked && !hardFailed && (mode === 'strict'
    ? operatorPass
    : group.operator === 'AND'
      ? score >= threshold
      : operatorPass)
  return {
    groupId: group.id,
    operator: group.operator,
    passed,
    score,
    maxScore,
    dataStatus,
    conditions,
    groups,
  }
}

export function evaluateDailyDslTemplate(
  template: DailyDslTemplate,
  bars: DailyDslBar[],
  asOf?: string | null,
): DailyDslEvaluationResult {
  const sliced = sliceBarsAsOf(bars, asOf)
  const root = evalGroup(template.root, sliced, template.executionMode, template.scoreThreshold)
  const flatConditions = flatten(root)
  return {
    passed: root.passed,
    totalScore: Number(root.score.toFixed(4)),
    maxScore: root.maxScore,
    dataStatus: root.dataStatus,
    summary: root.passed ? '日线 DSL 命中' : '日线 DSL 未命中',
    root,
    flatConditions,
  }
}
