/**
 * Agent Orchestrator — Goal → Plan → Act → Observe → Evaluate/Replan → Finalize
 * 第一期内存态；DB 账本见 Task 3.5。模型选择由调用方注入 reasoningCall。
 */

import { parseAgentAction, AgentActionProtocolError } from './agentActionProtocol'
import { evaluateCompletion } from './completionEvaluator'
import { assertNetworkAllowed, AgentNetworkGateError } from './networkGate'
import {
  applyObservationToPlan,
  createGoalState,
  createPlanState,
  findRunnableStep,
  revisePlan,
  type GoalState,
  type Observation,
  type PlanState,
} from './planner'
import type { HitlGate } from './hitlGate'
import { AgentHitlGateError } from './hitlGate'
import type { ToolRegistry } from './toolRegistry'
import { buildDefaultAgentSystemPrompt } from './skillPrompt'
import { buildSessionContext } from './sessionContext'
import type { AgentEvent, AgentSessionContext } from './types'

import { CONTEXT_WINDOW_CHARS } from '../services/researchContextEngine'

/** 送模上下文软上限（字符）；与 ResearchContextEngine.CONTEXT_WINDOW_CHARS 对齐。 */
export const AGENT_MODEL_CONTEXT_MAX_CHARS = CONTEXT_WINDOW_CHARS

export function trimConversationMessagesForContext(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxChars = AGENT_MODEL_CONTEXT_MAX_CHARS,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (messages.length === 0) return messages
  const total = messages.reduce((sum, m) => sum + m.content.length, 0)
  if (total <= maxChars) return messages
  const kept: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let used = 0
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i]!
    if (kept.length > 0 && used + item.content.length > maxChars) break
    kept.push(item)
    used += item.content.length
  }
  kept.reverse()
  if (kept.length < messages.length) {
    kept.unshift({
      role: 'assistant',
      content: '【系统】更早的会话内容已压缩或截断；请结合上方硬事实与摘要继续，勿假设空上下文。',
    })
  }
  return kept
}

/** tool_result 注入模型前的字符上限（防爆上下文）。 */
export const AGENT_TOOL_RESULT_MAX_CHARS = 4000

export const DEFAULT_MAX_STEPS = 8
export const DEFAULT_MAX_REVISIONS = 3

export type ReasoningCallInput = {
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>
  goal: GoalState
  plan: PlanState
  observations: Observation[]
  session: AgentSessionContext
  stepCount: number
}

export type ReasoningCall = (input: ReasoningCallInput) => Promise<string>

export type RunAgentTurnInput = {
  sessionId: number
  userMessage: string
  requestId: string
  onEvent: (event: AgentEvent) => void
  reasoningCall: ReasoningCall
  registry: ToolRegistry
  maxSteps?: number
  maxRevisions?: number
  /** 复杂目标：预先给出 PlanState（steps.length>0）；省略则允许 0-step final */
  initialPlan?: PlanState
  goal?: GoalState
  getNetworkEnabled?: () => boolean
  hitlGate?: HitlGate
  signal?: AbortSignal
  asOf?: string
  /**
   * 已装配的会话上下文（promptSent/摘要/热尾/当前句），不含 system。
   * 缺省时仅用当前 userMessage（兼容旧测试）。
   */
  conversationMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export type RunAgentTurnResult = {
  terminal: 'done' | 'error' | 'cancelled'
  text?: string
  goal: GoalState
  plan: PlanState
  waitingSubagent?: { runId: string }
  errorMessage?: string
}

function now(): number {
  return Date.now()
}

function actionFingerprint(name: string, args: Record<string, unknown>): string {
  return `${name}::${stableStringify(args)}`
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

export function capToolResultText(value: unknown, maxChars = AGENT_TOOL_RESULT_MAX_CHARS): {
  text: string
  truncated: boolean
} {
  let text: string
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (text.length <= maxChars) {
    return { text, truncated: false }
  }
  return {
    text: `${text.slice(0, maxChars)}…[truncated ${text.length - maxChars} chars]`,
    truncated: true,
  }
}

function extractWaitSubagent(raw: unknown): { runId: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (r.waitSubagent && typeof r.waitSubagent === 'object') {
    const w = r.waitSubagent as Record<string, unknown>
    if (typeof w.runId === 'string' && w.runId.trim()) {
      return { runId: w.runId.trim() }
    }
  }
  if (r.waitSubagent === true && typeof r.runId === 'string' && r.runId.trim()) {
    return { runId: r.runId.trim() }
  }
  if (typeof r.runId === 'string' && r.runId.trim() && (r.status === 'waiting' || r.waiting === true)) {
    return { runId: r.runId.trim() }
  }
  return undefined
}

function observationFromToolResult(raw: unknown, errorSummary?: string, failureCategory?: Observation['failureCategory']): Observation {
  if (errorSummary) {
    return {
      summary: errorSummary,
      evidenceRefs: [],
      remainingGaps: ['工具执行未成功'],
      failureCategory: failureCategory ?? 'replanable',
      raw,
    }
  }

  const wait = extractWaitSubagent(raw)
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  const summary =
    (rec && typeof rec.summary === 'string' && rec.summary) ||
    (typeof raw === 'string' ? raw.slice(0, 200) : '工具执行成功')

  const gapsRaw = rec?.remainingGaps
  const remainingGaps = Array.isArray(gapsRaw)
    ? gapsRaw.filter((g): g is string => typeof g === 'string')
    : []

  return {
    summary,
    evidenceRefs: Array.isArray(rec?.evidenceRefs)
      ? (rec!.evidenceRefs as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    remainingGaps,
    waitSubagent: wait,
    raw,
  }
}

function emit(
  onEvent: (e: AgentEvent) => void,
  partial: Omit<AgentEvent, 'at'> & { at?: number },
): void {
  onEvent({ ...partial, at: partial.at ?? now() })
}

function aborted(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted)
}

/**
 * 运行一轮 Agent turn（内存态）。每轮唯一终态：done | error | cancelled。
 */
export async function runAgentTurn(input: RunAgentTurnInput): Promise<RunAgentTurnResult> {
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS
  const maxRevisions = input.maxRevisions ?? DEFAULT_MAX_REVISIONS
  const { requestId, sessionId, onEvent, registry, signal } = input

  const session = buildSessionContext({
    sessionId,
    userGoal: input.userMessage,
    requestId,
    asOf: input.asOf,
  })

  let goal = input.goal ?? createGoalState({
    goal: input.userMessage,
    constraints: ['本地优先', '不荐股', '不自动交易'],
    nonGoals: ['荐股', '自动下单'],
    completionCriteria: [],
  })

  let plan = input.initialPlan
    ? createPlanState({
        steps: input.initialPlan.steps,
        revision: input.initialPlan.revision,
        status: input.initialPlan.status,
        gaps: input.initialPlan.gaps,
      })
    : createPlanState({ steps: [], revision: 1, status: 'active' })

  const observations: Observation[] = []
  const fingerprints = new Set<string>()
  let stepCount = 0
  let revisionCount = 0
  let terminalEmitted = false
  let finalText: string | undefined
  let waitingSubagent: { runId: string } | undefined

  const finish = (
    terminal: RunAgentTurnResult['terminal'],
    extra?: Partial<RunAgentTurnResult>,
  ): RunAgentTurnResult => {
    if (!terminalEmitted) {
      terminalEmitted = true
      if (terminal === 'done') {
        emit(onEvent, {
          type: 'done',
          requestId,
          sessionId,
          payload: {
            text: extra?.text ?? finalText,
            waitingSubagent: extra?.waitingSubagent ?? waitingSubagent,
          },
        })
      } else if (terminal === 'cancelled') {
        emit(onEvent, { type: 'cancelled', requestId, sessionId, payload: {} })
      } else {
        emit(onEvent, {
          type: 'error',
          requestId,
          sessionId,
          payload: { message: extra?.errorMessage ?? 'Agent turn 失败' },
        })
      }
    }
    return {
      terminal,
      text: extra?.text ?? finalText,
      goal,
      plan,
      waitingSubagent: extra?.waitingSubagent ?? waitingSubagent,
      errorMessage: extra?.errorMessage,
    }
  }

  emit(onEvent, { type: 'start', requestId, sessionId, payload: { userMessage: input.userMessage } })

  if (aborted(signal)) {
    goal = { ...goal, status: 'cancelled' }
    return finish('cancelled')
  }

  if (plan.steps.length > 0) {
    emit(onEvent, {
      type: 'plan',
      requestId,
      sessionId,
      payload: {
        revision: plan.revision,
        steps: plan.steps.map((s) => ({
          stepId: s.stepId,
          title: s.title,
          capabilityNeed: s.capabilityNeed,
          status: s.status,
        })),
      },
    })
  }

  const systemPrompt = buildDefaultAgentSystemPrompt(registry.listForPrompt(), [
    `当前目标：${goal.goal}`,
    plan.steps.length > 0
      ? `计划 revision=${plan.revision}：${plan.steps.map((s) => s.title).join(' → ')}`
      : '当前为轻量回合（可为 0-step）。',
    '须结合上方会话上下文（含硬事实/摘要/热尾）；勿假设空持仓或空标的。',
    '用户说「深度分析 / 深挖」时，优先继承已出现的股票代码与持仓事实；缺主体时先调用 local.portfolio_facts，再视需要 research.deep_start。',
  ])

  const conversation = trimConversationMessagesForContext(
    input.conversationMessages?.length
      ? input.conversationMessages
      : [{ role: 'user', content: input.userMessage }],
  )

  const messages: ReasoningCallInput['messages'] = [
    { role: 'system', content: systemPrompt },
    ...conversation.map((m) => ({ role: m.role, content: m.content })),
  ]

  try {
    // 主循环
    while (true) {
      if (aborted(signal)) {
        goal = { ...goal, status: 'cancelled' }
        return finish('cancelled')
      }

      const lastObservation = observations[observations.length - 1]
      const evaluation = evaluateCompletion({
        goal,
        plan,
        lastObservation,
        stepCount,
        maxSteps,
        revisionCount,
        maxRevisions,
      })

      if (evaluation.decision === 'wait_subagent') {
        waitingSubagent = lastObservation?.waitSubagent
        emit(onEvent, {
          type: 'status',
          requestId,
          sessionId,
          payload: {
            decision: 'wait_subagent',
            runId: waitingSubagent?.runId,
            reason: evaluation.reason,
          },
        })
        goal = { ...goal, status: 'open' }
        return finish('done', { waitingSubagent, text: lastObservation?.summary })
      }

      if (evaluation.decision === 'complete' && lastObservation) {
        // 已满足完成条件：再要一轮 final 文案（若尚无）
        if (!finalText) {
          const raw = await input.reasoningCall({
            messages,
            goal,
            plan,
            observations,
            session,
            stepCount,
          })
          if (aborted(signal)) {
            goal = { ...goal, status: 'cancelled' }
            return finish('cancelled')
          }
          try {
            const action = parseAgentAction(raw)
            if (action.type === 'final') {
              finalText = action.text
            } else {
              finalText = lastObservation.summary || '已完成目标。'
            }
          } catch {
            finalText = lastObservation.summary || '已完成目标。'
          }
        }
        emit(onEvent, {
          type: 'message',
          requestId,
          sessionId,
          payload: { text: finalText },
        })
        goal = { ...goal, status: 'completed' }
        return finish('done', { text: finalText })
      }

      if (evaluation.decision === 'blocked') {
        const text = `未能完成：${evaluation.reason ?? '阻塞'}`
        finalText = text
        emit(onEvent, {
          type: 'message',
          requestId,
          sessionId,
          payload: { text },
        })
        goal = { ...goal, status: 'blocked' }
        return finish('done', { text })
      }

      if (evaluation.decision === 'replan') {
        revisionCount += 1
        if (revisionCount > maxRevisions) {
          const text = `未能完成：已达 maxRevisions=${maxRevisions}`
          finalText = text
          emit(onEvent, { type: 'message', requestId, sessionId, payload: { text } })
          goal = { ...goal, status: 'blocked' }
          return finish('done', { text })
        }
        // 内存改道：保留缺口说明；具体新步骤由后续 reasoning 驱动的 tool 选择体现
        plan = revisePlan(plan, {
          gaps: lastObservation?.remainingGaps ?? plan.gaps,
          status: 'revised',
        })
        emit(onEvent, {
          type: 'plan',
          requestId,
          sessionId,
          payload: {
            revision: plan.revision,
            reason: evaluation.reason,
            gaps: plan.gaps,
            steps: plan.steps.map((s) => ({
              stepId: s.stepId,
              title: s.title,
              status: s.status,
            })),
          },
        })
        emit(onEvent, {
          type: 'status',
          requestId,
          sessionId,
          payload: { decision: 'replan', revision: plan.revision },
        })
        // 清除失败类别以免立即再次 replan；保留缺口
        if (lastObservation) {
          observations[observations.length - 1] = {
            ...lastObservation,
            failureCategory: undefined,
          }
        }
        continue
      }

      // continue：请求模型动作
      emit(onEvent, {
        type: 'status',
        requestId,
        sessionId,
        payload: { decision: 'continue', stepCount },
      })

      const rawAction = await input.reasoningCall({
        messages,
        goal,
        plan,
        observations,
        session,
        stepCount,
      })

      if (aborted(signal)) {
        goal = { ...goal, status: 'cancelled' }
        return finish('cancelled')
      }

      let action
      try {
        action = parseAgentAction(rawAction)
      } catch (err) {
        const msg = err instanceof AgentActionProtocolError ? err.message : '动作解析失败'
        observations.push({
          summary: msg,
          evidenceRefs: [],
          remainingGaps: goal.completionCriteria.length ? [...goal.completionCriteria] : ['有效动作'],
          failureCategory: 'retryable',
        })
        messages.push({ role: 'assistant', content: rawAction })
        messages.push({ role: 'tool', content: msg })
        stepCount += 1
        if (stepCount >= maxSteps) {
          const text = `未能完成：动作解析反复失败（maxSteps）`
          finalText = text
          emit(onEvent, { type: 'message', requestId, sessionId, payload: { text } })
          return finish('done', { text })
        }
        continue
      }

      if (action.type === 'final') {
        // 复杂目标且尚无成功观察、完成条件未满足时，不允许过早 final——当作说明性阻塞/完成尝试
        if (plan.steps.length > 0 && !plan.steps.every((s) => s.status === 'done')) {
          const pending = plan.steps.filter((s) => s.status !== 'done')
          if (pending.length > 0 && observations.length === 0) {
            // 仍允许模型在工具失败后 final 收尾；零观察时视为 0 工具收尾说明
            finalText = action.text
            emit(onEvent, { type: 'message', requestId, sessionId, payload: { text: finalText } })
            goal = { ...goal, status: 'completed' }
            return finish('done', { text: finalText })
          }
        }
        finalText = action.text
        emit(onEvent, { type: 'message', requestId, sessionId, payload: { text: finalText } })
        goal = { ...goal, status: 'completed' }
        return finish('done', { text: finalText })
      }

      // tool
      const fp = actionFingerprint(action.name, action.args)
      if (fingerprints.has(fp)) {
        const text = '未能完成：检测到重复工具调用（同 name+args 指纹熔断）'
        finalText = text
        emit(onEvent, {
          type: 'status',
          requestId,
          sessionId,
          payload: { decision: 'fuse', fingerprint: fp },
        })
        emit(onEvent, { type: 'message', requestId, sessionId, payload: { text } })
        goal = { ...goal, status: 'blocked' }
        return finish('done', { text })
      }
      fingerprints.add(fp)

      let def
      try {
        def = registry.get(action.name)
      } catch (err) {
        const msg = err instanceof Error ? err.message : '未知工具'
        const obs = observationFromToolResult(null, msg, 'replanable')
        observations.push(obs)
        messages.push({ role: 'assistant', content: rawAction })
        messages.push({ role: 'tool', content: capToolResultText(obs).text })
        emit(onEvent, {
          type: 'tool_result',
          requestId,
          sessionId,
          payload: { name: action.name, ok: false, summary: msg },
        })
        stepCount += 1
        continue
      }

      emit(onEvent, {
        type: 'tool_call',
        requestId,
        sessionId,
        payload: {
          name: action.name,
          args: action.args,
          ...(def.audit
            ? {
                source: def.audit.source,
                serverId: def.audit.serverId,
                toolName: def.audit.toolName,
              }
            : {}),
        },
      })

      // gates
      try {
        assertNetworkAllowed(def, { getNetworkEnabled: input.getNetworkEnabled })
      } catch (err) {
        const msg = err instanceof AgentNetworkGateError ? err.message : '联网未授权'
        const obs = observationFromToolResult(null, msg, 'replanable')
        observations.push(obs)
        const capped = capToolResultText({ error: msg })
        emit(onEvent, {
          type: 'tool_result',
          requestId,
          sessionId,
          payload: { name: action.name, ok: false, summary: msg, cappedText: capped.text },
        })
        messages.push({ role: 'assistant', content: rawAction })
        messages.push({ role: 'tool', content: capped.text })
        stepCount += 1
        continue
      }

      if (def.sideEffect === 'write') {
        const gate = input.hitlGate
        if (!gate) {
          const msg = '写操作需 HITL 闸门，但未注入 hitlGate'
          const obs = observationFromToolResult(null, msg, 'blocked')
          observations.push(obs)
          emit(onEvent, {
            type: 'tool_result',
            requestId,
            sessionId,
            payload: { name: action.name, ok: false, summary: msg },
          })
          stepCount += 1
          continue
        }
        try {
          gate.assertToolAllowed(def)
        } catch (err) {
          if (!(err instanceof AgentHitlGateError) || err.code !== 'HITL_REQUIRED') {
            const msg = err instanceof Error ? err.message : 'HITL 失败'
            observations.push(observationFromToolResult(null, msg, 'blocked'))
            stepCount += 1
            continue
          }
          const hitlRequestId = `${requestId}:hitl:${action.name}:${stepCount}`
          // 先挂起确认 Promise，再发 hitl 事件，避免 UI 同步 resolve 时尚未登记
          const hitlPending = gate.requestHitl({
            toolName: action.name,
            requestId: hitlRequestId,
            summary: `确认执行写操作：${action.name}`,
          })
          emit(onEvent, {
            type: 'hitl',
            requestId,
            sessionId,
            payload: {
              toolName: action.name,
              hitlRequestId,
              summary: `确认执行写操作：${action.name}`,
            },
          })
          const resolved = await hitlPending
          if (aborted(signal)) {
            goal = { ...goal, status: 'cancelled' }
            return finish('cancelled')
          }
          if (!resolved.approved) {
            const msg = '用户拒绝写操作'
            observations.push(observationFromToolResult(null, msg, 'blocked'))
            emit(onEvent, {
              type: 'tool_result',
              requestId,
              sessionId,
              payload: { name: action.name, ok: false, summary: msg },
            })
            stepCount += 1
            continue
          }
          try {
            gate.assertToolAllowed(def)
          } catch (assertErr) {
            const msg = assertErr instanceof Error ? assertErr.message : 'HITL 授权无效'
            observations.push(observationFromToolResult(null, msg, 'blocked'))
            stepCount += 1
            continue
          }
        }
      }

      // execute
      let rawResult: unknown
      try {
        rawResult = await def.execute(session, action.args)
      } catch (err) {
        const msg = err instanceof Error ? err.message : '工具执行异常'
        const obs = observationFromToolResult(null, msg, 'replanable')
        observations.push(obs)
        const capped = capToolResultText({ error: msg })
        emit(onEvent, {
          type: 'tool_result',
          requestId,
          sessionId,
          payload: { name: action.name, ok: false, summary: msg, cappedText: capped.text },
        })
        messages.push({ role: 'assistant', content: rawAction })
        messages.push({ role: 'tool', content: capped.text })
        stepCount += 1
        continue
      }

      const capped = capToolResultText(rawResult)
      let obs = observationFromToolResult(rawResult)

      // 若计划步骤声明了完成判据，成功执行且无显式缺口时清空对应当前步骤缺口
      const runnable = findRunnableStep(plan)
      if (runnable && !obs.failureCategory && !obs.waitSubagent) {
        if (obs.remainingGaps.length === 0) {
          // 标记步骤完成
          plan = applyObservationToPlan(plan, runnable.stepId, obs)
        } else {
          plan = applyObservationToPlan(plan, runnable.stepId, obs)
        }
      } else if (runnable && obs.waitSubagent) {
        plan = applyObservationToPlan(plan, runnable.stepId, obs)
      } else if (runnable && obs.failureCategory) {
        plan = applyObservationToPlan(plan, runnable.stepId, obs)
      }

      // 复杂计划：工具成功且无 remainingGaps → 视为当前步骤完成条件满足
      if (
        runnable &&
        !obs.failureCategory &&
        !obs.waitSubagent &&
        obs.remainingGaps.length === 0
      ) {
        obs = {
          ...obs,
          remainingGaps: plan.steps.every((s) => s.status === 'done')
            ? []
            : plan.steps
                .filter((s) => s.status !== 'done')
                .flatMap((s) => s.completionCriteria),
        }
        // 若仍有未完成步骤，缺口指向后续步骤；全部 done 则空
        if (plan.steps.every((s) => s.status === 'done')) {
          obs = { ...obs, remainingGaps: [] }
        }
      }

      observations.push(obs)
      emit(onEvent, {
        type: 'tool_result',
        requestId,
        sessionId,
        payload: {
          name: action.name,
          ok: !obs.failureCategory,
          summary: obs.summary,
          cappedText: capped.text,
          truncated: capped.truncated,
          waitSubagent: obs.waitSubagent,
          ...(def.audit
            ? {
                source: def.audit.source,
                serverId: def.audit.serverId,
                toolName: def.audit.toolName,
              }
            : {}),
        },
      })
      messages.push({ role: 'assistant', content: rawAction })
      messages.push({ role: 'tool', content: capped.text })
      stepCount += 1

      // 立即处理 wait_subagent
      if (obs.waitSubagent) {
        waitingSubagent = obs.waitSubagent
        emit(onEvent, {
          type: 'status',
          requestId,
          sessionId,
          payload: {
            decision: 'wait_subagent',
            runId: waitingSubagent.runId,
          },
        })
        return finish('done', { waitingSubagent, text: obs.summary })
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    goal = { ...goal, status: 'blocked' }
    return finish('error', { errorMessage: message })
  }
}
