import { describe, expect, it } from 'vitest'
import { appendStreamText } from '../../electron/main/services/aiProvider'

describe('appendStreamText', () => {
  it('concatenates deltas', () => {
    expect(appendStreamText('', '你')).toBe('你')
    expect(appendStreamText('你', '好')).toBe('你好')
  })

  it('ignores empty delta', () => {
    expect(appendStreamText('已有', '')).toBe('已有')
  })
})
