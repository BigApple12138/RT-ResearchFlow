import { describe, expect, it } from 'vitest'
import { extractOpenAIChatText } from '../../electron/main/services/aiProvider'

describe('extractOpenAIChatText', () => {
  it('reads string content', () => {
    expect(extractOpenAIChatText({ content: '  hello  ' })).toBe('hello')
  })

  it('joins array content parts', () => {
    expect(extractOpenAIChatText({
      content: [{ type: 'text', text: '一' }, { type: 'text', text: '二' }],
    })).toBe('一\n二')
  })

  it('falls back to reasoning_content when content empty', () => {
    expect(extractOpenAIChatText({
      content: '',
      reasoning_content: '本地板块涨跌 +6.56%，待验证。',
    })).toBe('本地板块涨跌 +6.56%，待验证。')
  })
})
