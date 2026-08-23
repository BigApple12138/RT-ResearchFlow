const sessionTails = new Map<number, Promise<void>>()

/**
 * Serializes every write-capable operation for one discussion session in the
 * main process. The promise tail is kept per session so unrelated sessions
 * can continue concurrently.
 *
 * 产品语义对齐 OpenClaw `session:<key>` lane
 *（`E:\代码库\git\openclaw\src\agents\embedded-agent-runner\lanes.ts` @ 46bdbe585f9）：
 * 同一 session 上 agentTurn / followUp / compact / deep 写回互斥串行。
 */
export async function withDiscussionSessionLock<T>(
  sessionId: number,
  operation: () => Promise<T> | T,
): Promise<T> {
  const previous = sessionTails.get(sessionId) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const tail = previous.then(() => gate, () => gate)
  sessionTails.set(sessionId, tail)

  try {
    await previous
    return await operation()
  } finally {
    release()
    if (sessionTails.get(sessionId) === tail) sessionTails.delete(sessionId)
  }
}

/** @internal 仅供单测隔离 session lock 状态 */
export function resetDiscussionSessionLocksForTests(): void {
  sessionTails.clear()
}
