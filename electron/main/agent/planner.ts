/** Goal / Plan / Observation — 目标驱动 Planner 状态（内存契约；账本见 Task 3.5）。 */

export type GoalStatus = 'open' | 'completed' | 'blocked' | 'cancelled'

export interface GoalState {
  goal: string
  constraints: string[]
  nonGoals: string[]
  completionCriteria: string[]
  status: GoalStatus
}

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface PlanStep {
  stepId: string
  title: string
  capabilityNeed: string[]
  dependsOn: string[]
  expectedArtifacts: string[]
  completionCriteria: string[]
  attempt: number
  status: PlanStepStatus
}

export type PlanStatus = 'draft' | 'active' | 'revised' | 'completed' | 'blocked'

export interface PlanState {
  revision: number
  steps: PlanStep[]
  status: PlanStatus
  gaps: string[]
}

export type FailureCategory = 'retryable' | 'replanable' | 'blocked'

export interface Observation {
  summary: string
  evidenceRefs: string[]
  remainingGaps: string[]
  failureCategory?: FailureCategory
  /** 第一期约定：SubAgent 等待语义 */
  waitSubagent?: { runId: string }
  raw?: unknown
}

export interface CreateGoalInput {
  goal: string
  constraints?: string[]
  nonGoals?: string[]
  completionCriteria?: string[]
  status?: GoalStatus
}

export interface CreatePlanStepInput {
  stepId: string
  title: string
  capabilityNeed: string[]
  dependsOn?: string[]
  expectedArtifacts?: string[]
  completionCriteria: string[]
  attempt?: number
  status?: PlanStepStatus
}

export function createGoalState(input: CreateGoalInput): GoalState {
  const goal = input.goal?.trim()
  if (!goal) {
    throw new Error('goal 不能为空')
  }
  return {
    goal,
    constraints: [...(input.constraints ?? [])],
    nonGoals: [...(input.nonGoals ?? [])],
    completionCriteria: [...(input.completionCriteria ?? [])],
    status: input.status ?? 'open',
  }
}

export function createPlanStep(input: CreatePlanStepInput): PlanStep {
  const stepId = input.stepId?.trim()
  if (!stepId) {
    throw new Error('stepId 不能为空')
  }
  return {
    stepId,
    title: input.title?.trim() || stepId,
    capabilityNeed: [...input.capabilityNeed],
    dependsOn: [...(input.dependsOn ?? [])],
    expectedArtifacts: [...(input.expectedArtifacts ?? [])],
    completionCriteria: [...input.completionCriteria],
    attempt: input.attempt ?? 0,
    status: input.status ?? 'pending',
  }
}

export function createPlanState(input: {
  steps?: PlanStep[]
  revision?: number
  status?: PlanStatus
  gaps?: string[]
} = {}): PlanState {
  return {
    revision: input.revision ?? 1,
    steps: (input.steps ?? []).map((s) => ({ ...s, capabilityNeed: [...s.capabilityNeed], dependsOn: [...s.dependsOn], expectedArtifacts: [...s.expectedArtifacts], completionCriteria: [...s.completionCriteria] })),
    status: input.status ?? 'active',
    gaps: [...(input.gaps ?? [])],
  }
}

/** 修订计划：revision +1，保留新步骤快照。 */
export function revisePlan(
  plan: PlanState,
  updates: {
    steps?: PlanStep[]
    gaps?: string[]
    status?: PlanStatus
  },
): PlanState {
  return {
    revision: plan.revision + 1,
    steps: (updates.steps ?? plan.steps).map((s) => ({
      ...s,
      capabilityNeed: [...s.capabilityNeed],
      dependsOn: [...s.dependsOn],
      expectedArtifacts: [...s.expectedArtifacts],
      completionCriteria: [...s.completionCriteria],
    })),
    status: updates.status ?? 'revised',
    gaps: updates.gaps !== undefined ? [...updates.gaps] : [...plan.gaps],
  }
}

function gapsCleared(obs: Observation): boolean {
  return !obs.remainingGaps?.length && !obs.failureCategory
}

/** 将观察写回对应步骤；清空缺口则标 done。 */
export function applyObservationToPlan(
  plan: PlanState,
  stepId: string,
  observation: Observation,
): PlanState {
  const steps = plan.steps.map((step) => {
    if (step.stepId !== stepId) return step

    let status: PlanStepStatus
    if (observation.waitSubagent) {
      status = 'running'
    } else if (observation.failureCategory) {
      status = 'failed'
    } else if (gapsCleared(observation)) {
      status = 'done'
    } else if (step.status === 'pending') {
      status = 'running'
    } else {
      status = step.status
    }

    return {
      ...step,
      attempt: step.attempt + 1,
      status,
    }
  })

  const allDone = steps.length > 0 && steps.every((s) => s.status === 'done')
  return {
    ...plan,
    steps,
    gaps: [...observation.remainingGaps],
    status: allDone ? 'completed' : plan.status,
  }
}

export function findRunnableStep(plan: PlanState): PlanStep | null {
  const done = new Set(plan.steps.filter((s) => s.status === 'done').map((s) => s.stepId))
  for (const step of plan.steps) {
    if (step.status === 'done' || step.status === 'skipped') continue
    if (step.dependsOn.every((d) => done.has(d))) {
      return step
    }
  }
  return null
}
