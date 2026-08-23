import type { GoalState, Observation, PlanState } from './planner'

export type EvaluationDecision =
  | 'continue'
  | 'replan'
  | 'wait_subagent'
  | 'complete'
  | 'blocked'

export interface EvaluationInput {
  goal: GoalState
  plan: PlanState
  lastObservation?: Observation
  stepCount: number
  maxSteps: number
  revisionCount: number
  maxRevisions: number
  /** 同 action 指纹重复时由 orchestrator 置位 */
  repeatedAction?: boolean
}

export interface EvaluationResult {
  decision: EvaluationDecision
  reason?: string
}

function criteriaSatisfied(goal: GoalState, plan: PlanState, last?: Observation): boolean {
  if (last?.waitSubagent) return false
  if (last?.failureCategory === 'blocked') return false
  if (last && last.remainingGaps.length > 0) return false

  if (plan.steps.length > 0) {
    const allDone = plan.steps.every((s) => s.status === 'done')
    if (allDone) return true
  }

  // 空完成条件：不得仅因「工具成功且无剩余缺口」自动 complete。
  // 轻量回合须由模型显式 final（或 maxSteps/熔断）收尾，避免「读完持仓就本轮完成」。
  if (goal.completionCriteria.length === 0) {
    return false
  }

  // 有完成条件时：无剩余缺口且（计划完成或已有成功观察）
  if (last && last.remainingGaps.length === 0 && !last.failureCategory && !last.waitSubagent) {
    if (plan.steps.length === 0) return true
    return plan.steps.every((s) => s.status === 'done' || s.status === 'skipped')
  }
  return false
}

/**
 * 每步后对照目标/计划/观察，决定继续、重规划、等待 SubAgent、完成或阻塞。
 */
export function evaluateCompletion(input: EvaluationInput): EvaluationResult {
  const {
    goal,
    plan,
    lastObservation,
    stepCount,
    maxSteps,
    revisionCount,
    maxRevisions,
    repeatedAction,
  } = input

  if (repeatedAction) {
    return { decision: 'blocked', reason: '重复动作指纹熔断' }
  }

  if (lastObservation?.waitSubagent?.runId) {
    return {
      decision: 'wait_subagent',
      reason: `等待 SubAgent：${lastObservation.waitSubagent.runId}`,
    }
  }

  if (lastObservation?.failureCategory === 'blocked') {
    return { decision: 'blocked', reason: lastObservation.summary || '步骤阻塞' }
  }

  if (criteriaSatisfied(goal, plan, lastObservation)) {
    return { decision: 'complete', reason: '完成条件已满足' }
  }

  if (stepCount >= maxSteps) {
    return { decision: 'blocked', reason: `已达 maxSteps=${maxSteps}` }
  }

  if (lastObservation?.failureCategory === 'replanable') {
    if (revisionCount >= maxRevisions) {
      return { decision: 'blocked', reason: `已达 maxRevisions=${maxRevisions}` }
    }
    return { decision: 'replan', reason: lastObservation.summary || '需要改道' }
  }

  if (lastObservation?.failureCategory === 'retryable') {
    return { decision: 'continue', reason: '可重试' }
  }

  return { decision: 'continue', reason: '继续推进' }
}
