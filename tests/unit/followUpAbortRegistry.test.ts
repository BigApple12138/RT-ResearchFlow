import { afterEach, describe, expect, it } from 'vitest'
import {
  abortFollowUp,
  clearFollowUpAbortRegistryForTests,
  registerFollowUpAbort,
  removeFollowUpAbort,
} from '../../electron/main/services/followUpAbortRegistry'

describe('followUpAbortRegistry', () => {
  afterEach(() => {
    clearFollowUpAbortRegistryForTests()
  })

  it('register 后 abort 触发 signal', () => {
    const controller = registerFollowUpAbort('11111111-1111-4111-8111-111111111111')
    expect(controller.signal.aborted).toBe(false)
    expect(abortFollowUp('11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(controller.signal.aborted).toBe(true)
  })

  it('重复 abort 幂等；未知 id 返回 false', () => {
    registerFollowUpAbort('22222222-2222-4222-8222-222222222222')
    expect(abortFollowUp('22222222-2222-4222-8222-222222222222')).toBe(true)
    expect(abortFollowUp('22222222-2222-4222-8222-222222222222')).toBe(true)
    expect(abortFollowUp('33333333-3333-4333-8333-333333333333')).toBe(false)
  })

  it('remove 后 abort 返回 false', () => {
    registerFollowUpAbort('44444444-4444-4444-8444-444444444444')
    removeFollowUpAbort('44444444-4444-4444-8444-444444444444')
    expect(abortFollowUp('44444444-4444-4444-8444-444444444444')).toBe(false)
  })
})
