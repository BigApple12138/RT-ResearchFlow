/**
 * Agent Hub 执行账本：turn / step / observation 状态跃迁、幂等与启动恢复。
 * messages 不承担运行恢复；已 terminal 的 turn 不重放副作用。
 */

import type Database from 'better-sqlite3'
import { createHash, randomUUID } from 'crypto'
import type {
  AgentObservationFailureCategory,
  AgentObservationRow,
  AgentStepRow,
  AgentStepStatus,
  AgentTurnRow,
  AgentTurnStatus,
  AgentTurnTerminal,
} from './types'

export const AGENT_EXECUTION_JSON_LIMITS = Object.freeze({
  completionCriteria: 16 * 1024,
  dependsOn: 8 * 1024,
  capabilityNeed: 8 * 1024,
  intent: 64 * 1024,
  outcome: 64 * 1024,
  evidenceRefs: 16 * 1024,
  remainingGaps: 16 * 1024,
  fingerprint: 64 * 1024,
})

const TURN_TRANSITIONS: Readonly<Record<AgentTurnStatus, readonly AgentTurnStatus[]>> = {
  running: ['waiting_subagent', 'interrupted', 'done', 'error', 'cancelled'],
  waiting_subagent: ['running', 'done', 'error', 'cancelled'],
  interrupted: ['running', 'waiting_subagent', 'done', 'error', 'cancelled'],
  done: [],
  error: [],
  cancelled: [],
}

const STEP_TRANSITIONS: Readonly<Record<AgentStepStatus, readonly AgentStepStatus[]>> = {
  pending: ['running', 'waiting_subagent', 'skipped', 'cancelled'],
  running: ['waiting_subagent', 'done', 'failed', 'cancelled'],
  waiting_subagent: ['running', 'done', 'failed', 'cancelled'],
  done: [],
  failed: ['running', 'cancelled'],
  skipped: [],
  cancelled: [],
}

const TERMINAL_STATUSES: readonly AgentTurnTerminal[] = ['done', 'error', 'cancelled']

export class AgentExecutionRepositoryError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'AgentExecutionRepositoryError'
  }
}

export function canTransitionAgentTurnStatus(from: AgentTurnStatus, to: AgentTurnStatus): boolean {
  return TURN_TRANSITIONS[from].includes(to)
}

export function canTransitionAgentStepStatus(from: AgentStepStatus, to: AgentStepStatus): boolean {
  return STEP_TRANSITIONS[from].includes(to)
}

export function hashAgentExecutionText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function serializeAgentExecutionJson(
  value: unknown,
  maxBytes: number,
  expectedSha256?: string,
): { json: string; sha256: string; bytes: number } {
  if (value == null || typeof value !== 'object') {
    throw new AgentExecutionRepositoryError('INVALID_JSON', 'Agent 账本 JSON 必须是对象或数组')
  }
  const json = JSON.stringify(toCanonicalJson(value, new Set<object>()))
  const bytes = Buffer.byteLength(json, 'utf8')
  if (bytes > maxBytes) {
    throw new AgentExecutionRepositoryError('JSON_TOO_LARGE', `Agent 账本 JSON 超过 ${maxBytes} 字节上限`)
  }
  const sha256 = hashAgentExecutionText(json)
  if (expectedSha256 != null && expectedSha256 !== sha256) {
    throw new AgentExecutionRepositoryError('HASH_MISMATCH', 'Agent 账本 JSON 哈希与内容不一致')
  }
  return { json, sha256, bytes }
}

export interface StartAgentTurnInput {
  requestId: string
  sessionId: number
  goal: string
  completionCriteria?: readonly string[]
  turnId?: string
  planRevision?: number
  now?: number
}

export interface StartAgentTurnResult {
  turn: AgentTurnRow
  replayed: boolean
}

export function startAgentTurn(
  db: Database.Database,
  input: StartAgentTurnInput,
): StartAgentTurnResult {
  assertBoundedId(input.requestId, 80, 'requestId')
  if (!Number.isSafeInteger(input.sessionId) || input.sessionId <= 0) {
    throw new AgentExecutionRepositoryError('INVALID_INPUT', 'sessionId 必须是正整数')
  }
  const goal = input.goal.trim()
  if (!goal || goal.length > 8000) {
    throw new AgentExecutionRepositoryError('INVALID_INPUT', 'goal 不能为空且不能超过 8000 字符')
  }
  const criteria = serializeAgentExecutionJson(
    [...(input.completionCriteria ?? [])],
    AGENT_EXECUTION_JSON_LIMITS.completionCriteria,
  )
  const planRevision = input.planRevision ?? 1
  if (!Number.isSafeInteger(planRevision) || planRevision < 1) {
    throw new AgentExecutionRepositoryError('INVALID_INPUT', 'planRevision 必须是 >= 1 的整数')
  }
  const fingerprint = serializeAgentExecutionJson(
    {
      sessionId: input.sessionId,
      goal,
      completionCriteriaSha256: criteria.sha256,
      planRevision,
    },
    AGENT_EXECUTION_JSON_LIMITS.fingerprint,
  )
  const existing = getAgentTurnByRequestId(db, input.requestId)
  if (existing) {
    if (existing.request_fingerprint !== fingerprint.sha256) {
      throw new AgentExecutionRepositoryError('REQUEST_ID_CONFLICT', 'requestId 已用于不同的 Agent turn 输入')
    }
    return { turn: existing, replayed: true }
  }

  const turnId = input.turnId ?? randomUUID()
  assertBoundedId(turnId, 64, 'turnId')
  const now = input.now ?? Date.now()
  db.prepare(`
    INSERT INTO agent_turns (
      id, request_id, request_fingerprint, session_id, goal, completion_criteria_json,
      plan_revision, status, terminal, error_code, error_message, revision,
      created_at, updated_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', NULL, NULL, NULL, 0, ?, ?, NULL)
  `).run(
    turnId,
    input.requestId.trim(),
    fingerprint.sha256,
    input.sessionId,
    goal,
    criteria.json,
    planRevision,
    now,
    now,
  )
  return { turn: requireAgentTurn(db, turnId), replayed: false }
}

export function getAgentTurn(db: Database.Database, turnId: string): AgentTurnRow | null {
  return (db.prepare('SELECT * FROM agent_turns WHERE id = ?').get(turnId) as AgentTurnRow | undefined) ?? null
}

export function getAgentTurnByRequestId(
  db: Database.Database,
  requestId: string,
): AgentTurnRow | null {
  return (db.prepare('SELECT * FROM agent_turns WHERE request_id = ?').get(requestId) as AgentTurnRow | undefined) ?? null
}

export interface AgentTurnLedger {
  turn: AgentTurnRow
  steps: AgentStepRow[]
  observations: AgentObservationRow[]
}

export function getAgentTurnLedger(
  db: Database.Database,
  turnId: string,
): AgentTurnLedger | null {
  const turn = getAgentTurn(db, turnId)
  if (!turn) return null
  const steps = db.prepare(`
    SELECT * FROM agent_steps WHERE turn_id = ? ORDER BY created_at ASC, id ASC
  `).all(turnId) as AgentStepRow[]
  const observations = db.prepare(`
    SELECT * FROM agent_observations WHERE turn_id = ? ORDER BY created_at ASC, id ASC
  `).all(turnId) as AgentObservationRow[]
  return { turn, steps, observations }
}

export function updateAgentTurnPlanRevision(
  db: Database.Database,
  input: { turnId: string; planRevision: number; now?: number; expectedRevision?: number },
): AgentTurnRow {
  const turn = requireAgentTurn(db, input.turnId)
  assertTurnWritable(turn)
  assertRevision(turn.revision, input.expectedRevision)
  if (!Number.isSafeInteger(input.planRevision) || input.planRevision < 1) {
    throw new AgentExecutionRepositoryError('INVALID_INPUT', 'planRevision 必须是 >= 1 的整数')
  }
  if (input.planRevision < turn.plan_revision) {
    throw new AgentExecutionRepositoryError('TURN_STATE_CONFLICT', 'planRevision 不允许回退')
  }
  const now = input.now ?? Date.now()
  db.prepare(`
    UPDATE agent_turns
    SET plan_revision = ?, revision = revision + 1, updated_at = ?
    WHERE id = ? AND revision = ?
  `).run(input.planRevision, now, input.turnId, turn.revision)
  return requireAgentTurn(db, input.turnId)
}

export function transitionAgentTurnStatus(
  db: Database.Database,
  input: {
    turnId: string
    toStatus: AgentTurnStatus
    errorCode?: string | null
    errorMessage?: string | null
    now?: number
    expectedRevision?: number
  },
): AgentTurnRow {
  const turn = requireAgentTurn(db, input.turnId)
  assertRevision(turn.revision, input.expectedRevision)
  if (turn.status === input.toStatus) return turn
  if (!canTransitionAgentTurnStatus(turn.status, input.toStatus)) {
    throw new AgentExecutionRepositoryError(
      'TURN_STATE_CONFLICT',
      `不允许从 ${turn.status} 转为 ${input.toStatus}`,
    )
  }
  const now = input.now ?? Date.now()
  const terminal = isTerminalStatus(input.toStatus) ? input.toStatus : null
  const completedAt = terminal != null ? now : null
  db.prepare(`
    UPDATE agent_turns
    SET status = ?, terminal = ?, completed_at = ?,
        error_code = ?, error_message = ?,
        revision = revision + 1, updated_at = ?
    WHERE id = ? AND revision = ?
  `).run(
    input.toStatus,
    terminal,
    completedAt,
    input.errorCode ?? null,
    input.errorMessage ?? null,
    now,
    input.turnId,
    turn.revision,
  )
  return requireAgentTurn(db, input.turnId)
}

export interface FinalizeAgentTurnInput {
  turnId: string
  terminal: AgentTurnTerminal
  errorCode?: string | null
  errorMessage?: string | null
  now?: number
  expectedRevision?: number
}

export interface FinalizeAgentTurnResult {
  turn: AgentTurnRow
  replayed: boolean
}

/** 唯一终态写入；重复相同终态通知幂等返回。 */
export function finalizeAgentTurn(
  db: Database.Database,
  input: FinalizeAgentTurnInput,
): FinalizeAgentTurnResult {
  const turn = requireAgentTurn(db, input.turnId)
  if (isTerminalStatus(turn.status)) {
    if (turn.terminal === input.terminal) {
      return { turn, replayed: true }
    }
    throw new AgentExecutionRepositoryError(
      'TURN_TERMINAL_CONFLICT',
      `turn 已终态为 ${turn.terminal}，不能再写入 ${input.terminal}`,
    )
  }
  const updated = transitionAgentTurnStatus(db, {
    turnId: input.turnId,
    toStatus: input.terminal,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    now: input.now,
    expectedRevision: input.expectedRevision,
  })
  return { turn: updated, replayed: false }
}

export interface UpsertAgentStepInput {
  turnId: string
  stepId: string
  agentId?: string
  role?: string
  taskId?: string | null
  parentTaskId?: string | null
  title?: string
  dependsOn?: readonly string[]
  capabilityNeed?: readonly string[]
  planRevision?: number
  attempt?: number
  status?: AgentStepStatus
  subagentRunId?: string | null
  now?: number
}

export function upsertAgentStep(
  db: Database.Database,
  input: UpsertAgentStepInput,
): AgentStepRow {
  const turn = requireAgentTurn(db, input.turnId)
  assertTurnWritable(turn)
  assertBoundedId(input.stepId, 80, 'stepId')
  const agentId = (input.agentId ?? 'main').trim()
  const role = (input.role ?? 'planner_executor').trim()
  assertBoundedId(agentId, 80, 'agentId')
  assertBoundedId(role, 80, 'role')
  if (input.taskId != null) assertBoundedId(input.taskId, 80, 'taskId')
  if (input.parentTaskId != null) assertBoundedId(input.parentTaskId, 80, 'parentTaskId')
  const title = (input.title ?? input.stepId).trim()
  if (title.length > 500) {
    throw new AgentExecutionRepositoryError('INVALID_INPUT', 'title 不能超过 500 字符')
  }
  const dependsOn = serializeAgentExecutionJson(
    [...(input.dependsOn ?? [])],
    AGENT_EXECUTION_JSON_LIMITS.dependsOn,
  )
  const capabilityNeed = serializeAgentExecutionJson(
    [...(input.capabilityNeed ?? [])],
    AGENT_EXECUTION_JSON_LIMITS.capabilityNeed,
  )
  const planRevision = input.planRevision ?? turn.plan_revision
  if (!Number.isSafeInteger(planRevision) || planRevision < 1) {
    throw new AgentExecutionRepositoryError('INVALID_INPUT', 'planRevision 必须是 >= 1 的整数')
  }
  const attempt = input.attempt ?? 0
  if (!Number.isSafeInteger(attempt) || attempt < 0) {
    throw new AgentExecutionRepositoryError('INVALID_INPUT', 'attempt 必须是非负整数')
  }
  const status = input.status ?? 'pending'
  if (status === 'waiting_subagent' && !input.subagentRunId?.trim()) {
    throw new AgentExecutionRepositoryError('INVALID_INPUT', 'waiting_subagent 步骤必须绑定 subagentRunId')
  }
  if (input.subagentRunId != null) assertBoundedId(input.subagentRunId, 64, 'subagentRunId')
  const now = input.now ?? Date.now()
  const existing = getAgentStep(db, input.stepId)

  const transaction = db.transaction(() => {
    if (existing) {
      if (existing.turn_id !== input.turnId) {
        throw new AgentExecutionRepositoryError('STEP_ID_CONFLICT', 'stepId 已属于其他 turn')
      }
      if (isStepTerminal(existing.status) && status !== existing.status) {
        throw new AgentExecutionRepositoryError(
          'STEP_STATE_CONFLICT',
          `终态步骤 ${existing.status} 不能被 upsert 改写为 ${status}`,
        )
      }
      if (existing.status !== status && !canTransitionAgentStepStatus(existing.status, status)) {
        throw new AgentExecutionRepositoryError(
          'STEP_STATE_CONFLICT',
          `不允许从 ${existing.status} 转为 ${status}`,
        )
      }
      db.prepare(`
        UPDATE agent_steps
        SET agent_id = ?, role = ?, task_id = ?, parent_task_id = ?, title = ?,
            depends_on_json = ?, capability_need_json = ?, plan_revision = ?,
            attempt = ?, status = ?, subagent_run_id = ?,
            started_at = CASE
              WHEN ? IN ('running', 'waiting_subagent') THEN COALESCE(started_at, ?)
              ELSE started_at
            END,
            completed_at = CASE
              WHEN ? IN ('done', 'failed', 'skipped', 'cancelled') THEN COALESCE(completed_at, ?)
              ELSE NULL
            END,
            revision = revision + 1, updated_at = ?
        WHERE id = ?
      `).run(
        agentId,
        role,
        input.taskId ?? null,
        input.parentTaskId ?? null,
        title,
        dependsOn.json,
        capabilityNeed.json,
        planRevision,
        attempt,
        status,
        input.subagentRunId ?? existing.subagent_run_id,
        status,
        now,
        status,
        now,
        now,
        input.stepId,
      )
      bumpTurnRevision(db, input.turnId, now)
      return requireAgentStep(db, input.stepId)
    }

    db.prepare(`
      INSERT INTO agent_steps (
        id, turn_id, agent_id, role, task_id, parent_task_id, title,
        depends_on_json, capability_need_json, plan_revision, attempt, status,
        subagent_run_id, intent_json, intent_sha256, outcome_json, outcome_sha256,
        revision, error_code, error_message, created_at, updated_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, NULL, NULL, ?, ?, ?, ?)
    `).run(
      input.stepId.trim(),
      input.turnId,
      agentId,
      role,
      input.taskId ?? null,
      input.parentTaskId ?? null,
      title,
      dependsOn.json,
      capabilityNeed.json,
      planRevision,
      attempt,
      status,
      input.subagentRunId ?? null,
      now,
      now,
      status === 'running' || status === 'waiting_subagent' ? now : null,
      isStepTerminal(status) ? now : null,
    )
    bumpTurnRevision(db, input.turnId, now)
    return requireAgentStep(db, input.stepId)
  })
  return transaction()
}

export function getAgentStep(db: Database.Database, stepId: string): AgentStepRow | null {
  return (db.prepare('SELECT * FROM agent_steps WHERE id = ?').get(stepId) as AgentStepRow | undefined) ?? null
}

export function transitionAgentStepStatus(
  db: Database.Database,
  input: {
    stepId: string
    toStatus: AgentStepStatus
    subagentRunId?: string | null
    errorCode?: string | null
    errorMessage?: string | null
    now?: number
    expectedRevision?: number
  },
): AgentStepRow {
  const step = requireAgentStep(db, input.stepId)
  const turn = requireAgentTurn(db, step.turn_id)
  assertTurnWritable(turn)
  assertRevision(step.revision, input.expectedRevision)
  if (step.status === input.toStatus) {
    if (
      input.toStatus === 'waiting_subagent'
      && input.subagentRunId != null
      && step.subagent_run_id !== input.subagentRunId
    ) {
      throw new AgentExecutionRepositoryError('STEP_STATE_CONFLICT', 'waiting_subagent 已绑定不同的 runId')
    }
    return step
  }
  if (!canTransitionAgentStepStatus(step.status, input.toStatus)) {
    throw new AgentExecutionRepositoryError(
      'STEP_STATE_CONFLICT',
      `不允许从 ${step.status} 转为 ${input.toStatus}`,
    )
  }
  const subagentRunId = input.toStatus === 'waiting_subagent'
    ? (input.subagentRunId ?? step.subagent_run_id)
    : (input.subagentRunId !== undefined ? input.subagentRunId : step.subagent_run_id)
  if (input.toStatus === 'waiting_subagent' && !subagentRunId?.trim()) {
    throw new AgentExecutionRepositoryError('INVALID_INPUT', 'waiting_subagent 步骤必须绑定 subagentRunId')
  }
  if (subagentRunId != null) assertBoundedId(subagentRunId, 64, 'subagentRunId')
  const now = input.now ?? Date.now()
  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE agent_steps
      SET status = ?, subagent_run_id = ?,
          attempt = attempt + CASE WHEN ? = 'running' AND ? <> 'running' THEN 1 ELSE 0 END,
          error_code = ?, error_message = ?,
          started_at = CASE
            WHEN ? IN ('running', 'waiting_subagent') THEN COALESCE(started_at, ?)
            ELSE started_at
          END,
          completed_at = CASE
            WHEN ? IN ('done', 'failed', 'skipped', 'cancelled') THEN ?
            ELSE NULL
          END,
          revision = revision + 1, updated_at = ?
      WHERE id = ? AND revision = ?
    `).run(
      input.toStatus,
      subagentRunId,
      input.toStatus,
      step.status,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      input.toStatus,
      now,
      input.toStatus,
      now,
      now,
      input.stepId,
      step.revision,
    )
    if (input.toStatus === 'waiting_subagent') {
      transitionAgentTurnStatus(db, {
        turnId: step.turn_id,
        toStatus: 'waiting_subagent',
        now,
      })
    }
    bumpTurnRevision(db, step.turn_id, now)
    return requireAgentStep(db, input.stepId)
  })
  return transaction()
}

/** 副作用提交前保存 intent（幂等：相同 hash 复用）。 */
export function saveAgentStepIntent(
  db: Database.Database,
  input: { stepId: string; intent: unknown; intentSha256?: string; now?: number },
): AgentStepRow {
  const step = requireAgentStep(db, input.stepId)
  const turn = requireAgentTurn(db, step.turn_id)
  assertTurnWritable(turn)
  if (isStepTerminal(step.status)) {
    throw new AgentExecutionRepositoryError('STEP_STATE_CONFLICT', '终态步骤不能再写 intent')
  }
  const intent = serializeAgentExecutionJson(
    input.intent,
    AGENT_EXECUTION_JSON_LIMITS.intent,
    input.intentSha256,
  )
  if (step.intent_json != null) {
    if (step.intent_sha256 !== intent.sha256) {
      throw new AgentExecutionRepositoryError('HASH_MISMATCH', '步骤 intent 已固化且内容不一致')
    }
    return step
  }
  const now = input.now ?? Date.now()
  db.prepare(`
    UPDATE agent_steps
    SET intent_json = ?, intent_sha256 = ?, revision = revision + 1, updated_at = ?
    WHERE id = ? AND intent_json IS NULL
  `).run(intent.json, intent.sha256, now, input.stepId)
  bumpTurnRevision(db, step.turn_id, now)
  return requireAgentStep(db, input.stepId)
}

/** 副作用完成后保存 outcome（幂等：相同 hash 复用）。 */
export function saveAgentStepOutcome(
  db: Database.Database,
  input: { stepId: string; outcome: unknown; outcomeSha256?: string; now?: number },
): AgentStepRow {
  const step = requireAgentStep(db, input.stepId)
  const turn = requireAgentTurn(db, step.turn_id)
  assertTurnWritable(turn)
  if (step.intent_json == null) {
    throw new AgentExecutionRepositoryError('STEP_STATE_CONFLICT', '保存 outcome 前必须先保存 intent')
  }
  const outcome = serializeAgentExecutionJson(
    input.outcome,
    AGENT_EXECUTION_JSON_LIMITS.outcome,
    input.outcomeSha256,
  )
  if (step.outcome_json != null) {
    if (step.outcome_sha256 !== outcome.sha256) {
      throw new AgentExecutionRepositoryError('HASH_MISMATCH', '步骤 outcome 已固化且内容不一致')
    }
    return step
  }
  const now = input.now ?? Date.now()
  db.prepare(`
    UPDATE agent_steps
    SET outcome_json = ?, outcome_sha256 = ?, revision = revision + 1, updated_at = ?
    WHERE id = ? AND outcome_json IS NULL
  `).run(outcome.json, outcome.sha256, now, input.stepId)
  bumpTurnRevision(db, step.turn_id, now)
  return requireAgentStep(db, input.stepId)
}

export interface AppendAgentObservationInput {
  turnId: string
  stepId?: string | null
  summary: string
  evidenceRefs?: readonly string[]
  remainingGaps?: readonly string[]
  failureCategory?: AgentObservationFailureCategory | null
  observationId?: string
  now?: number
}

export interface AppendAgentObservationResult {
  observation: AgentObservationRow
  replayed: boolean
}

export function appendAgentObservation(
  db: Database.Database,
  input: AppendAgentObservationInput,
): AppendAgentObservationResult {
  const turn = requireAgentTurn(db, input.turnId)
  assertTurnWritable(turn)
  const summary = input.summary.trim()
  if (!summary || summary.length > 4000) {
    throw new AgentExecutionRepositoryError('INVALID_INPUT', 'summary 不能为空且不能超过 4000 字符')
  }
  if (input.stepId != null) {
    const step = requireAgentStep(db, input.stepId)
    if (step.turn_id !== input.turnId) {
      throw new AgentExecutionRepositoryError('STEP_STATE_CONFLICT', 'observation 的 step 不属于该 turn')
    }
  }
  const evidenceRefs = serializeAgentExecutionJson(
    [...(input.evidenceRefs ?? [])],
    AGENT_EXECUTION_JSON_LIMITS.evidenceRefs,
  )
  const remainingGaps = serializeAgentExecutionJson(
    [...(input.remainingGaps ?? [])],
    AGENT_EXECUTION_JSON_LIMITS.remainingGaps,
  )
  if (
    input.failureCategory != null
    && !['retryable', 'replanable', 'blocked'].includes(input.failureCategory)
  ) {
    throw new AgentExecutionRepositoryError('INVALID_INPUT', 'failureCategory 非法')
  }
  const contentPayload = serializeAgentExecutionJson(
    {
      stepId: input.stepId ?? null,
      summary,
      evidenceRefsSha256: evidenceRefs.sha256,
      remainingGapsSha256: remainingGaps.sha256,
      failureCategory: input.failureCategory ?? null,
    },
    AGENT_EXECUTION_JSON_LIMITS.fingerprint,
  )
  const existing = db.prepare(`
    SELECT * FROM agent_observations WHERE turn_id = ? AND content_hash = ?
  `).get(input.turnId, contentPayload.sha256) as AgentObservationRow | undefined
  if (existing) {
    return { observation: existing, replayed: true }
  }

  const id = input.observationId ?? randomUUID()
  assertBoundedId(id, 64, 'observationId')
  const now = input.now ?? Date.now()
  db.prepare(`
    INSERT INTO agent_observations (
      id, turn_id, step_id, summary, evidence_refs_json, failure_category,
      remaining_gaps_json, content_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.turnId,
    input.stepId ?? null,
    summary,
    evidenceRefs.json,
    input.failureCategory ?? null,
    remainingGaps.json,
    contentPayload.sha256,
    now,
  )
  bumpTurnRevision(db, input.turnId, now)
  return { observation: requireAgentObservation(db, id), replayed: false }
}

export type AgentRecoveryKind =
  | 'noop_terminal'
  | 'resume_before_tool'
  | 'resume_after_tool'
  | 'bind_waiting_subagent'

export interface AgentRecoveryPlan {
  turn: AgentTurnRow
  kind: AgentRecoveryKind
  stepId: string | null
  subagentRunId: string | null
  /** 是否允许重放可能产生副作用的 Tool（仅 before_tool）。 */
  mayReplaySideEffect: boolean
}

/** 启动时：running → interrupted；waiting_subagent 保持并绑定既有 run。 */
export function markRunningAgentTurnsInterrupted(
  db: Database.Database,
  input: { now?: number } = {},
): AgentTurnRow[] {
  const now = input.now ?? Date.now()
  const transaction = db.transaction(() => {
    const rows = db.prepare(`
      SELECT id FROM agent_turns WHERE status = 'running' ORDER BY updated_at ASC, id ASC
    `).all() as Array<{ id: string }>
    const result: AgentTurnRow[] = []
    for (const row of rows) {
      result.push(transitionAgentTurnStatus(db, {
        turnId: row.id,
        toStatus: 'interrupted',
        errorCode: 'PROCESS_INTERRUPTED',
        errorMessage: '进程中断，等待恢复判定',
        now,
      }))
    }
    return result
  })
  return transaction()
}

export function listRecoverableAgentTurns(db: Database.Database): AgentTurnRow[] {
  return db.prepare(`
    SELECT * FROM agent_turns
    WHERE status IN ('interrupted', 'waiting_subagent')
    ORDER BY updated_at ASC, id ASC
  `).all() as AgentTurnRow[]
}

export function classifyAgentTurnRecovery(
  db: Database.Database,
  turnId: string,
): AgentRecoveryPlan {
  const ledger = getAgentTurnLedger(db, turnId)
  if (!ledger) {
    throw new AgentExecutionRepositoryError('TURN_NOT_FOUND', 'Agent turn 不存在')
  }
  const { turn, steps, observations } = ledger
  if (isTerminalStatus(turn.status)) {
    return {
      turn,
      kind: 'noop_terminal',
      stepId: null,
      subagentRunId: null,
      mayReplaySideEffect: false,
    }
  }

  if (turn.status === 'waiting_subagent') {
    const waiting = [...steps].reverse().find((s) => s.status === 'waiting_subagent' && s.subagent_run_id)
    if (!waiting?.subagent_run_id) {
      throw new AgentExecutionRepositoryError(
        'RECOVERY_STATE_CONFLICT',
        'waiting_subagent turn 缺少绑定的 SubAgent runId',
      )
    }
    return {
      turn,
      kind: 'bind_waiting_subagent',
      stepId: waiting.id,
      subagentRunId: waiting.subagent_run_id,
      mayReplaySideEffect: false,
    }
  }

  if (turn.status !== 'interrupted' && turn.status !== 'running') {
    throw new AgentExecutionRepositoryError(
      'RECOVERY_STATE_CONFLICT',
      `状态 ${turn.status} 不支持恢复分类`,
    )
  }

  const focus = findRecoveryFocusStep(steps)
  if (!focus) {
    return {
      turn,
      kind: 'resume_before_tool',
      stepId: null,
      subagentRunId: null,
      mayReplaySideEffect: false,
    }
  }

  const hasOutcome = focus.outcome_json != null
  const hasObservation = observations.some((o) => o.step_id === focus.id)
  if (hasOutcome || hasObservation) {
    return {
      turn,
      kind: 'resume_after_tool',
      stepId: focus.id,
      subagentRunId: focus.subagent_run_id,
      mayReplaySideEffect: false,
    }
  }

  return {
    turn,
    kind: 'resume_before_tool',
    stepId: focus.id,
    subagentRunId: focus.subagent_run_id,
    mayReplaySideEffect: focus.intent_json != null,
  }
}

/** 对可恢复 turn 生成恢复计划；terminal 返回 noop。 */
export function buildAgentRecoveryPlans(db: Database.Database): AgentRecoveryPlan[] {
  const recoverable = listRecoverableAgentTurns(db)
  return recoverable.map((turn) => classifyAgentTurnRecovery(db, turn.id))
}

/**
 * 薄封装：启动恢复入口。将 running 标为 interrupted，返回全部恢复计划。
 * Orchestrator 可据此继续合法下一步，且不对 terminal 重放。
 */
export function prepareAgentExecutionRecovery(
  db: Database.Database,
  input: { now?: number } = {},
): {
  interrupted: AgentTurnRow[]
  plans: AgentRecoveryPlan[]
} {
  const interrupted = markRunningAgentTurnsInterrupted(db, input)
  const plans = buildAgentRecoveryPlans(db)
  return { interrupted, plans }
}

function findRecoveryFocusStep(steps: AgentStepRow[]): AgentStepRow | null {
  const active = [...steps].reverse().find((s) =>
    s.status === 'running' || s.status === 'waiting_subagent' || s.status === 'pending'
  )
  if (active) return active
  return [...steps].reverse().find((s) => s.status === 'done' || s.status === 'failed') ?? null
}

function requireAgentTurn(db: Database.Database, turnId: string): AgentTurnRow {
  const turn = getAgentTurn(db, turnId)
  if (!turn) throw new AgentExecutionRepositoryError('TURN_NOT_FOUND', 'Agent turn 不存在')
  return turn
}

function requireAgentStep(db: Database.Database, stepId: string): AgentStepRow {
  const step = getAgentStep(db, stepId)
  if (!step) throw new AgentExecutionRepositoryError('STEP_NOT_FOUND', 'Agent step 不存在')
  return step
}

function requireAgentObservation(db: Database.Database, id: string): AgentObservationRow {
  const row = db.prepare('SELECT * FROM agent_observations WHERE id = ?').get(id) as AgentObservationRow | undefined
  if (!row) throw new AgentExecutionRepositoryError('OBSERVATION_NOT_FOUND', 'Agent observation 不存在')
  return row
}

function assertTurnWritable(turn: AgentTurnRow): void {
  if (isTerminalStatus(turn.status)) {
    throw new AgentExecutionRepositoryError('TURN_STATE_CONFLICT', '终态 turn 不能再变更账本')
  }
}

function isTerminalStatus(status: AgentTurnStatus): status is AgentTurnTerminal {
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
}

function isStepTerminal(status: AgentStepStatus): boolean {
  return status === 'done' || status === 'skipped' || status === 'cancelled'
}

function assertRevision(current: number, expected: number | undefined): void {
  if (expected != null && current !== expected) {
    throw new AgentExecutionRepositoryError(
      'TURN_STATE_CONFLICT',
      `版本已变化：期望 ${expected}，实际 ${current}`,
    )
  }
}

function bumpTurnRevision(db: Database.Database, turnId: string, now: number): void {
  db.prepare(`
    UPDATE agent_turns SET revision = revision + 1, updated_at = ? WHERE id = ?
  `).run(now, turnId)
}

function assertBoundedId(value: string, maxLength: number, field: string): void {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) {
    throw new AgentExecutionRepositoryError(
      'INVALID_INPUT',
      `${field} 不能为空且不能超过 ${maxLength} 个字符`,
    )
  }
}

function toCanonicalJson(value: unknown, active: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AgentExecutionRepositoryError('INVALID_JSON', 'Agent 账本 JSON 不能包含非有限数值')
    }
    return value
  }
  if (typeof value !== 'object') {
    throw new AgentExecutionRepositoryError('INVALID_JSON', 'Agent 账本 JSON 包含不可序列化值')
  }
  if (active.has(value)) {
    throw new AgentExecutionRepositoryError('INVALID_JSON', 'Agent 账本 JSON 不能包含循环引用')
  }
  active.add(value)
  try {
    if (Array.isArray(value)) return value.map((item) => toCanonicalJson(item, active))
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new AgentExecutionRepositoryError('INVALID_JSON', 'Agent 账本 JSON 只能包含普通对象')
    }
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, toCanonicalJson(record[key], active)]),
    )
  } finally {
    active.delete(value)
  }
}
