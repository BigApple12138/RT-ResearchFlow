import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_MIGRATIONS, runMigrations } from '../../electron/main/database/db'
import {
  appendAgentObservation,
  classifyAgentTurnRecovery,
  finalizeAgentTurn,
  listRecoverableAgentTurns,
  markRunningAgentTurnsInterrupted,
  prepareAgentExecutionRecovery,
  saveAgentStepIntent,
  saveAgentStepOutcome,
  startAgentTurn,
  transitionAgentStepStatus,
  transitionAgentTurnStatus,
  upsertAgentStep,
} from '../../electron/main/database/agentExecutionRepository'

let sequence = 0

function id(prefix = 'id'): string {
  sequence += 1
  return `${prefix}-${String(sequence).padStart(4, '0')}`
}

describe('agentRecovery', () => {
  let db: Database.Database

  beforeEach(() => {
    sequence = 0
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, DATABASE_MIGRATIONS.filter((m) => m.version === 148))
  })

  afterEach(() => db.close())

  it('Tool 前中断：running → interrupted，可判定为 resume_before_tool', () => {
    const { turn } = startAgentTurn(db, {
      requestId: id('req'),
      sessionId: 1,
      goal: '看持仓',
      turnId: id('turn'),
      now: 1,
    })
    const step = upsertAgentStep(db, {
      turnId: turn.id,
      stepId: id('step'),
      capabilityNeed: ['local.portfolio_facts'],
      status: 'running',
      now: 2,
    })
    saveAgentStepIntent(db, {
      stepId: step.id,
      intent: { tool: 'local.portfolio_facts', args: {} },
      now: 3,
    })

    const interrupted = markRunningAgentTurnsInterrupted(db, { now: 100 })
    expect(interrupted).toHaveLength(1)
    expect(interrupted[0]).toMatchObject({
      id: turn.id,
      status: 'interrupted',
      error_code: 'PROCESS_INTERRUPTED',
    })

    const plan = classifyAgentTurnRecovery(db, turn.id)
    expect(plan).toMatchObject({
      kind: 'resume_before_tool',
      stepId: step.id,
      mayReplaySideEffect: true,
    })
    expect(listRecoverableAgentTurns(db).map((t) => t.id)).toEqual([turn.id])
  })

  it('Tool 后未 final：有 outcome/observation 时 resume_after_tool，禁止重放副作用', () => {
    const { turn } = startAgentTurn(db, {
      requestId: id('req'),
      sessionId: 2,
      goal: '看持仓并总结',
      turnId: id('turn'),
      now: 1,
    })
    const step = upsertAgentStep(db, {
      turnId: turn.id,
      stepId: id('step'),
      capabilityNeed: ['local.portfolio_facts'],
      status: 'running',
      now: 2,
    })
    saveAgentStepIntent(db, {
      stepId: step.id,
      intent: { tool: 'local.portfolio_facts', args: {} },
      now: 3,
    })
    saveAgentStepOutcome(db, {
      stepId: step.id,
      outcome: { holdings: 2 },
      now: 4,
    })
    transitionAgentStepStatus(db, { stepId: step.id, toStatus: 'done', now: 5 })
    appendAgentObservation(db, {
      turnId: turn.id,
      stepId: step.id,
      summary: '已取持仓事实',
      remainingGaps: ['尚未形成最终总结'],
      now: 6,
    })

    prepareAgentExecutionRecovery(db, { now: 200 })
    const plan = classifyAgentTurnRecovery(db, turn.id)
    expect(plan).toMatchObject({
      kind: 'resume_after_tool',
      stepId: step.id,
      mayReplaySideEffect: false,
    })
  })

  it('waiting SubAgent：保持 waiting_subagent 并绑定既有 run，不转为 interrupted', () => {
    const { turn } = startAgentTurn(db, {
      requestId: id('req'),
      sessionId: 3,
      goal: '深挖 600519',
      turnId: id('turn'),
      now: 1,
    })
    const step = upsertAgentStep(db, {
      turnId: turn.id,
      stepId: id('step'),
      capabilityNeed: ['research.deep_start'],
      status: 'running',
      now: 2,
    })
    saveAgentStepIntent(db, {
      stepId: step.id,
      intent: { tool: 'research.deep_start', args: { subject: '600519.SH' } },
      now: 3,
    })
    const runId = id('run')
    transitionAgentStepStatus(db, {
      stepId: step.id,
      toStatus: 'waiting_subagent',
      subagentRunId: runId,
      now: 4,
    })
    expect(db.prepare('SELECT status FROM agent_turns WHERE id = ?').get(turn.id)).toEqual({
      status: 'waiting_subagent',
    })

    const { interrupted, plans } = prepareAgentExecutionRecovery(db, { now: 300 })
    expect(interrupted).toHaveLength(0)
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({
      kind: 'bind_waiting_subagent',
      stepId: step.id,
      subagentRunId: runId,
      mayReplaySideEffect: false,
    })
    expect(db.prepare('SELECT status FROM agent_turns WHERE id = ?').get(turn.id)).toEqual({
      status: 'waiting_subagent',
    })
  })

  it('重复终态通知幂等；terminal turn 不进入恢复队列', () => {
    const { turn } = startAgentTurn(db, {
      requestId: id('req'),
      sessionId: 4,
      goal: '结束',
      turnId: id('turn'),
      now: 1,
    })
    const first = finalizeAgentTurn(db, { turnId: turn.id, terminal: 'done', now: 10 })
    const second = finalizeAgentTurn(db, { turnId: turn.id, terminal: 'done', now: 20 })
    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(true)

    const { interrupted, plans } = prepareAgentExecutionRecovery(db, { now: 400 })
    expect(interrupted).toHaveLength(0)
    expect(plans).toHaveLength(0)
    expect(classifyAgentTurnRecovery(db, turn.id).kind).toBe('noop_terminal')
  })

  it('混合场景：仅 running 被打断，waiting 与 terminal 不被误伤', () => {
    const running = startAgentTurn(db, {
      requestId: id('req'),
      sessionId: 5,
      goal: 'running-goal',
      turnId: id('turn'),
      now: 1,
    }).turn
    upsertAgentStep(db, {
      turnId: running.id,
      stepId: id('step'),
      status: 'running',
      now: 2,
    })

    const waiting = startAgentTurn(db, {
      requestId: id('req'),
      sessionId: 5,
      goal: 'waiting-goal',
      turnId: id('turn'),
      now: 3,
    }).turn
    const waitingStep = upsertAgentStep(db, {
      turnId: waiting.id,
      stepId: id('step'),
      status: 'running',
      now: 4,
    })
    transitionAgentStepStatus(db, {
      stepId: waitingStep.id,
      toStatus: 'waiting_subagent',
      subagentRunId: id('run'),
      now: 5,
    })

    const done = startAgentTurn(db, {
      requestId: id('req'),
      sessionId: 5,
      goal: 'done-goal',
      turnId: id('turn'),
      now: 6,
    }).turn
    finalizeAgentTurn(db, { turnId: done.id, terminal: 'cancelled', now: 7 })

    const { interrupted, plans } = prepareAgentExecutionRecovery(db, { now: 500 })
    expect(interrupted.map((t) => t.id)).toEqual([running.id])
    expect(plans.map((p) => ({ id: p.turn.id, kind: p.kind })).sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual([
        { id: running.id, kind: 'resume_before_tool' },
        { id: waiting.id, kind: 'bind_waiting_subagent' },
      ].sort((a, b) => a.id.localeCompare(b.id)))

    // 显式恢复 running：interrupted → running 后可继续
    transitionAgentTurnStatus(db, { turnId: running.id, toStatus: 'running', now: 600 })
    expect(db.prepare('SELECT status, error_code FROM agent_turns WHERE id = ?').get(running.id)).toEqual({
      status: 'running',
      error_code: null,
    })
  })
})
