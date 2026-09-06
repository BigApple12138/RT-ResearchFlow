const controllers = new Map<string, AbortController>()

export function registerFollowUpAbort(requestId: string): AbortController {
  const existing = controllers.get(requestId)
  if (existing) return existing
  const controller = new AbortController()
  controllers.set(requestId, controller)
  return controller
}

export function abortFollowUp(requestId: string): boolean {
  const controller = controllers.get(requestId)
  if (!controller) return false
  if (!controller.signal.aborted) controller.abort()
  return true
}

export function removeFollowUpAbort(requestId: string): void {
  controllers.delete(requestId)
}

export function clearFollowUpAbortRegistryForTests(): void {
  controllers.clear()
}
