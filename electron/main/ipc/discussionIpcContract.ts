export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export type DiscussionIpcValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 'INVALID_PARAM'; message: string }

export interface DiscussionFollowUpRequest {
  requestId: string
  sessionId: number
  message: string
}

export interface DiscussionCompactionRequest {
  requestId: string
  sessionId: number
  mode: 'auto' | 'manual'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function validSessionId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function validateDiscussionFollowUpInput(
  value: unknown,
): DiscussionIpcValidationResult<DiscussionFollowUpRequest> {
  const record = asRecord(value)
  if (!record || !hasOnlyKeys(record, ['requestId', 'sessionId', 'message'])) {
    return { ok: false, code: 'INVALID_PARAM', message: 'follow-up 请求格式无效' }
  }
  if (!isUuid(record.requestId)) {
    return { ok: false, code: 'INVALID_PARAM', message: 'requestId 格式无效' }
  }
  if (!validSessionId(record.sessionId)) {
    return { ok: false, code: 'INVALID_PARAM', message: 'sessionId 无效' }
  }
  if (typeof record.message !== 'string' || !record.message.trim()) {
    return { ok: false, code: 'INVALID_PARAM', message: '追问内容不能为空' }
  }
  return {
    ok: true,
    data: {
      requestId: record.requestId,
      sessionId: record.sessionId,
      message: record.message.trim(),
    },
  }
}

export function validateDiscussionCompactionInput(
  value: unknown,
): DiscussionIpcValidationResult<DiscussionCompactionRequest> {
  const record = asRecord(value)
  if (!record || !hasOnlyKeys(record, ['requestId', 'sessionId', 'mode'])) {
    return { ok: false, code: 'INVALID_PARAM', message: '上下文整理请求格式无效' }
  }
  if (!isUuid(record.requestId)) {
    return { ok: false, code: 'INVALID_PARAM', message: 'requestId 格式无效' }
  }
  if (!validSessionId(record.sessionId)) {
    return { ok: false, code: 'INVALID_PARAM', message: 'sessionId 无效' }
  }
  if (record.mode !== 'auto' && record.mode !== 'manual') {
    return { ok: false, code: 'INVALID_PARAM', message: '整理模式无效' }
  }
  return {
    ok: true,
    data: {
      requestId: record.requestId,
      sessionId: record.sessionId,
      mode: record.mode,
    },
  }
}
