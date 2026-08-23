import { describe, expect, it } from 'vitest'
import { withDiscussionSessionLock } from '../../electron/main/services/discussionSessionLock'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((next) => { resolve = next })
  return { promise, resolve }
}

describe('讨论 session 锁', () => {
  it('同一 session 的操作按注册顺序串行执行', async () => {
    const events: string[] = []
    const gate = deferred()

    const first = withDiscussionSessionLock(11, async () => {
      events.push('first:start')
      await gate.promise
      events.push('first:end')
      return 'first'
    })
    const second = withDiscussionSessionLock(11, async () => {
      events.push('second:start')
      return 'second'
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])
    gate.resolve()

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second'])
    expect(events).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('不同 session 可以并行执行', async () => {
    const gate = deferred()
    const events: string[] = []

    const first = withDiscussionSessionLock(21, async () => {
      events.push('first')
      await gate.promise
    })
    const second = withDiscussionSessionLock(22, async () => {
      events.push('second')
    })

    await second
    expect(events).toEqual(['first', 'second'])
    gate.resolve()
    await first
  })
})
