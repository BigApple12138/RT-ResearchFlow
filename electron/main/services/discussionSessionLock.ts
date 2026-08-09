const sessionTails = new Map<number, Promise<void>>()

/**
 * Serializes every write-capable operation for one discussion session in the
 * main process. The promise tail is kept per session so unrelated sessions
 * can continue concurrently.
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
