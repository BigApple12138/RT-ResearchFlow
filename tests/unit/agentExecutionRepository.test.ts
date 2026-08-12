import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_MIGRATIONS, runMigrations } from '../../electron/main/database/db'
import {
  AgentExecutionRepositoryError,
  appendAgentObservation,
  canTransitionAgentStepStatus,
  canTransitionAgentTurnStatus,
  finalizeAgentTurn,
  getAgentTurnByRequestId,
  getAgentTurnLedger,
  saveAgentStepIntent,
  saveAgentStepOutcome,
  startAgentTurn,
  transitionAgentStepStatus,
  transitionAgentTurnStatus,
  updateAgentTurnPlanRevision,
  upsertAgentStep,
} from '../../electron/main/database/agentExecutionRepository'

let sequence = 0

function id(prefix = 'id'): string {
  sequence += 1
  return `${prefix}-${String(sequence).padStart(4, '0')}`
}

describe('agentExecutionRepository', () => {
  let db: Database.Database

  beforeEach(() => {
    sequence = 0
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, DATABASE_MIGRATIONS.filter((m) => m.version === 148))
  })

  afterEach(() => db.close())

  it('Migration 148 建表、幂等初始化、唯一约束与失败回滚', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'agent_%'
      ORDER BY name
    `).all() as Array<{ name: string }>
    expect(tables.map((t) => t.name)).toEqual([
      'agent_observations',
      'agent_steps',
      'agent_turns',
    ])
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 148 }])

    runMigrations(db, DATABASE_MIGRATIONS.filter((m) => m.version === 148))
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 148 }])

    const turnSql = (db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_turns'
    `).get() as { sql: string }).sql
    expect(turnSql).toContain('waiting_subagent')
    expect(turnSql).toContain('interrupted')

    const started = startAgentTurn(db, {
      requestId: id('req'),
      sessionId: 1,
      goal: '看看持仓',
      turnId: id('turn'),
      now: 100,
    })
    expect(() => db.prepare(`
      INSERT INTO agent_turns (
        id, request_id, request_fingerprint, session_id, goal, completion_criteria_json,
        plan_revision, status, terminal, revision, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, 1, 'x', '[]', 1, 'running', NULL, 0, 1, 1, NULL)
    `).run(id('turn'), started.turn.request_id, 'a'.repeat(64))).toThrow(/UNIQUE|constraint/i)

    expect(() => db.prepare("UPDATE agent_turns SET status = 'invalid' WHERE id = ?").run(started.turn.id))
      .toThrow(/CHECK constraint failed/)

    const failing = db.transaction(() => {
      db.prepare(`
        INSERT INTO agent_steps (
          id, turn_id, agent_id, role, title, depends_on_json, capability_need_json,
          plan_revision, attempt, status, revision, created_at, updated_at
        ) VALUES (?, ?, 'main', 'planner_executor', 's', '[]', '[]', 1, 0, 'pending', 0, 1, 1)
      `).run(id('step'), started.turn.id)
      throw new Error('force-rollback')
    })
    expect(() => failing()).toThrow('force-rollback')
    expect(db.prepare('SELECT COUNT(*) AS c FROM agent_steps').get()).toEqual({ c: 0 })
  })

  it('合法状态跃迁；非法回退拒绝', () => {
    expect(canTransitionAgentTurnStatus('running', 'done')).toBe(true)
    expect(canTransitionAgentTurnStatus('done', 'running')).toBe(false)
    expect(canTransitionAgentStepStatus('pending', 'running')).toBe(true)
    expect(canTransitionAgentStepStatus('done', 'running')).toBe(false)

    const { turn } = startAgentTurn(db, {
      requestId: id('req'),
      sessionId: 2,
      goal: '深挖茅台',
      completionCriteria: ['有结论'],
      turnId: id('turn'),
      now: 10,
    })
    const step = upsertAgentStep(db, {
      turnId: turn.id,
      stepId: id('step'),
      capabilityNeed: ['research.deep_start'],
      status: 'pending',
      now: 20,
    })
    transitionAgentStepStatus(db, { stepId: step.id, toStatus: 'running', now: 30 })
    expect(() => transitionAgentStepStatus(db, { stepId: step.id, toStatus: 'pending', now: 40 }))
      .toThrow(AgentExecutionRepositoryError)

    transitionAgentTurnStatus(db, { turnId: turn.id, toStatus: 'interrupted', now: 50 })
    expect(() => transitionAgentTurnStatus(db, { turnId: turn.id, toStatus: 'waiting_subagent', now: 55 }))
      .not.toThrow()
    // waiting_subagent 不允许直接回退到 interrupted
    expect(() => transitionAgentTurnStatus(db, {
      turnId: turn.id,
      toStatus: 'interrupted',
      now: 60,
    })).toThrow(/不允许从 waiting_subagent/)
  })

  it('requestId 幂等；冲突指纹拒绝', () => {
    const first = startAgentTurn(db, {
      requestId: 'same-request',
      sessionId: 3,
      goal: '持仓简报',
      turnId: id('turn'),
      now: 1,
    })
    const second = startAgentTurn(db, {
      requestId: 'same-request',
      sessionId: 3,
      goal: '持仓简报',
      turnId: id('turn'),
      now: 2,
    })
    expect(second.replayed).toBe(true)
    expect(second.turn.id).toBe(first.turn.id)
    expect(getAgentTurnByRequestId(db, 'same-request')?.id).toBe(first.turn.id)

    try {
      startAgentTurn(db, {
        requestId: 'same-request',
        sessionId: 9,
        goal: '持仓简报',
        now: 3,
      })
      expect.fail('should throw')
    } catch (error) {
      expect(error).toBeInstanceOf(AgentExecutionRepositoryError)
      expect((error as AgentExecutionRepositoryError).code).toBe('REQUEST_ID_CONFLICT')
    }
  })

  it('唯一终态：重复相同终态幂等，不同终态冲突', () => {
    const { turn } = startAgentTurn(db, {
      requestId: id('req'),
      sessionId: 4,
      goal: '总结',
      turnId: id('turn'),
      now: 1,
    })
    const first = finalizeAgentTurn(db, { turnId: turn.id, terminal: 'done', now: 10 })
    expect(first.replayed).toBe(false)
    expect(first.turn).toMatchObject({ status: 'done', terminal: 'done' })

    const second = finalizeAgentTurn(db, { turnId: turn.id, terminal: 'done', now: 20 })
    expect(second.replayed).toBe(true)

    try {
      finalizeAgentTurn(db, { turnId: turn.id, terminal: 'error', now: 30 })
      expect.fail('should throw')
    } catch (error) {
      expect(error).toBeInstanceOf(AgentExecutionRepositoryError)
      expect((error as AgentExecutionRepositoryError).code).toBe('TURN_TERMINAL_CONFLICT')
    }

    expect(() => upsertAgentStep(db, { turnId: turn.id, stepId: id('step'), now: 40 }))
      .toThrow(/终态 turn/)
  })

  it('intent/outcome 固化、observation 按 hash 幂等，plan revision 不可回退', () => {
    const { turn } = startAgentTurn(db, {
      requestId: id('req'),
      sessionId: 5,
      goal: '本地事实',
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
    saveAgentStepIntent(db, { stepId: step.id, intent: { tool: 'local.portfolio_facts', args: {} }, now: 3 })
    saveAgentStepIntent(db, { stepId: step.id, intent: { tool: 'local.portfolio_facts', args: {} }, now: 4 })
    try {
      saveAgentStepIntent(db, {
        stepId: step.id,
        intent: { tool: 'other', args: {} },
        now: 5,
      })
      expect.fail('should throw')
    } catch (error) {
      expect(error).toBeInstanceOf(AgentExecutionRepositoryError)
      expect((error as AgentExecutionRepositoryError).code).toBe('HASH_MISMATCH')
    }

    expect(() => saveAgentStepOutcome(db, { stepId: step.id, outcome: { ok: true }, now: 6 }))
      .not.toThrow()
    transitionAgentStepStatus(db, { stepId: step.id, toStatus: 'done', now: 7 })

    const obs1 = appendAgentObservation(db, {
      turnId: turn.id,
      stepId: step.id,
      summary: '持仓 3 只',
      evidenceRefs: ['portfolio:v1'],
      remainingGaps: [],
      now: 8,
    })
    const obs2 = appendAgentObservation(db, {
      turnId: turn.id,
      stepId: step.id,
      summary: '持仓 3 只',
      evidenceRefs: ['portfolio:v1'],
      remainingGaps: [],
      now: 9,
    })
    expect(obs2.replayed).toBe(true)
    expect(obs2.observation.id).toBe(obs1.observation.id)

    updateAgentTurnPlanRevision(db, { turnId: turn.id, planRevision: 2, now: 10 })
    expect(() => updateAgentTurnPlanRevision(db, { turnId: turn.id, planRevision: 1, now: 11 }))
      .toThrow(/不允许回退/)

    const ledger = getAgentTurnLedger(db, turn.id)
    expect(ledger?.steps).toHaveLength(1)
    expect(ledger?.observations).toHaveLength(1)
    expect(ledger?.turn.plan_revision).toBe(2)
  })
})
