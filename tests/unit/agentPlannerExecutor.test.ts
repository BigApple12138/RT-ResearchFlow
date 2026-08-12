import { describe, expect, it } from 'vitest'
import {
  createGoalState,
  createPlanState,
  createPlanStep,
  revisePlan,
  applyObservationToPlan,
} from '../../electron/main/agent/planner'
import { selectCapabilityCandidates } from '../../electron/main/agent/capabilityRouter'
import { evaluateCompletion } from '../../electron/main/agent/completionEvaluator'
import { createToolRegistry } from '../../electron/main/agent/toolRegistry'
import type { AgentSessionContext, ToolDefinition } from '../../electron/main/agent/types'
import type { Observation } from '../../electron/main/agent/planner'

function stubTool(name: string, description = name): ToolDefinition {
  return {
    name,
    description,
    sideEffect: 'read',
    parametersSchema: { type: 'object', additionalProperties: false, properties: {} },
    async execute(_ctx: AgentSessionContext) {
      return { ok: true }
    },
  }
}

describe('agentPlannerExecutor', () => {
  it('创建 GoalState：目标、约束、非目标、完成条件', () => {
    const goal = createGoalState({
      goal: '看看我的持仓今天要注意什么',
      constraints: ['不荐股', '本地优先'],
      nonGoals: ['自动下单'],
      completionCriteria: ['已读取持仓事实', '给出有依据摘要'],
    })
    expect(goal.status).toBe('open')
    expect(goal.goal).toContain('持仓')
    expect(goal.completionCriteria).toHaveLength(2)
    expect(goal.nonGoals).toContain('自动下单')
  })

  it('复杂目标两步 Plan：依赖、capabilityNeed、判据、revision', () => {
    const step1 = createPlanStep({
      stepId: 's1',
      title: '读取本地持仓',
      capabilityNeed: ['local.portfolio_facts'],
      expectedArtifacts: ['portfolio_facts'],
      completionCriteria: ['持仓事实可用'],
    })
    const step2 = createPlanStep({
      stepId: 's2',
      title: '核对行情缺口',
      capabilityNeed: ['local.market_snapshot'],
      dependsOn: ['s1'],
      expectedArtifacts: ['quote_summary'],
      completionCriteria: ['行情摘要可用'],
    })
    const plan = createPlanState({ steps: [step1, step2] })
    expect(plan.revision).toBe(1)
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[1].dependsOn).toEqual(['s1'])
    expect(plan.status).toBe('active')
  })

  it('CapabilityRouter 按 capabilityNeed 从 registry 选候选', () => {
    const registry = createToolRegistry()
    registry.register(stubTool('local.portfolio_facts', '持仓'))
    registry.register(stubTool('local.market_snapshot', '行情'))
    registry.register(stubTool('web.search', '搜索'))

    const local = selectCapabilityCandidates(registry, ['local.portfolio_facts'])
    expect(local.map((t) => t.name)).toEqual(['local.portfolio_facts'])

    const prefix = selectCapabilityCandidates(registry, ['local.*'])
    expect(prefix.map((t) => t.name).sort()).toEqual(['local.market_snapshot', 'local.portfolio_facts'])
  })

  it('Observation 更新缺口；CompletionEvaluator：continue → complete', () => {
    const goal = createGoalState({
      goal: '核对持仓',
      completionCriteria: ['持仓事实可用'],
    })
    let plan = createPlanState({
      steps: [
        createPlanStep({
          stepId: 's1',
          title: '读持仓',
          capabilityNeed: ['local.portfolio_facts'],
          completionCriteria: ['持仓事实可用'],
        }),
      ],
    })

    const gapObs: Observation = {
      summary: '尚未取数',
      evidenceRefs: [],
      remainingGaps: ['持仓事实可用'],
    }
    expect(evaluateCompletion({
      goal,
      plan,
      lastObservation: gapObs,
      stepCount: 0,
      maxSteps: 8,
      revisionCount: 0,
      maxRevisions: 3,
    }).decision).toBe('continue')

    const doneObs: Observation = {
      summary: '已读取持仓 3 只',
      evidenceRefs: ['portfolio:1'],
      remainingGaps: [],
    }
    plan = applyObservationToPlan(plan, 's1', doneObs)
    const evalDone = evaluateCompletion({
      goal,
      plan,
      lastObservation: doneObs,
      stepCount: 1,
      maxSteps: 8,
      revisionCount: 0,
      maxRevisions: 3,
    })
    expect(evalDone.decision).toBe('complete')
    expect(plan.steps[0].status).toBe('done')
  })

  it('失败可改道 → replan；revision 递增；blocked / wait_subagent', () => {
    const goal = createGoalState({
      goal: '深挖某标的',
      completionCriteria: ['深挖完成'],
    })
    const plan = createPlanState({
      steps: [
        createPlanStep({
          stepId: 's1',
          title: '取网',
          capabilityNeed: ['web.search'],
          completionCriteria: ['公开资料'],
        }),
      ],
    })

    const replanObs: Observation = {
      summary: '网络不可用',
      evidenceRefs: [],
      remainingGaps: ['公开资料'],
      failureCategory: 'replanable',
    }
    expect(evaluateCompletion({
      goal,
      plan,
      lastObservation: replanObs,
      stepCount: 1,
      maxSteps: 8,
      revisionCount: 0,
      maxRevisions: 3,
    }).decision).toBe('replan')

    const revised = revisePlan(plan, {
      steps: [
        createPlanStep({
          stepId: 's2',
          title: '改用本地基本面',
          capabilityNeed: ['local.fundamentals_read'],
          completionCriteria: ['基本面摘要'],
        }),
      ],
      gaps: ['改用本地'],
    })
    expect(revised.revision).toBe(plan.revision + 1)

    expect(evaluateCompletion({
      goal,
      plan,
      lastObservation: {
        summary: '权限不足',
        evidenceRefs: [],
        remainingGaps: ['公开资料'],
        failureCategory: 'blocked',
      },
      stepCount: 1,
      maxSteps: 8,
      revisionCount: 0,
      maxRevisions: 3,
    }).decision).toBe('blocked')

    expect(evaluateCompletion({
      goal,
      plan,
      lastObservation: {
        summary: '已启动深挖',
        evidenceRefs: [],
        remainingGaps: ['深挖完成'],
        waitSubagent: { runId: 'run-42' },
      },
      stepCount: 1,
      maxSteps: 8,
      revisionCount: 0,
      maxRevisions: 3,
    }).decision).toBe('wait_subagent')
  })

  it('maxSteps / maxRevisions 耗尽时 blocked', () => {
    const goal = createGoalState({ goal: 'x', completionCriteria: ['y'] })
    const plan = createPlanState({
      steps: [createPlanStep({ stepId: 's1', title: 't', capabilityNeed: ['local.x'], completionCriteria: ['y'] })],
    })
    expect(evaluateCompletion({
      goal,
      plan,
      lastObservation: { summary: 'still going', evidenceRefs: [], remainingGaps: ['y'] },
      stepCount: 8,
      maxSteps: 8,
      revisionCount: 0,
      maxRevisions: 3,
    }).decision).toBe('blocked')

    expect(evaluateCompletion({
      goal,
      plan,
      lastObservation: {
        summary: 'fail',
        evidenceRefs: [],
        remainingGaps: ['y'],
        failureCategory: 'replanable',
      },
      stepCount: 2,
      maxSteps: 8,
      revisionCount: 3,
      maxRevisions: 3,
    }).decision).toBe('blocked')
  })
})
