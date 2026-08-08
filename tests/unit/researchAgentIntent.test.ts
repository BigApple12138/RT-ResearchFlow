import { describe, expect, it } from 'vitest'
import {
  detectResearchAgentIntent,
  isGlobalResearchBusy,
  isSessionResearchBusy,
} from '../../src/components/AIAnalysis/researchAgentIntent'

describe('researchAgentIntent', () => {
  it('识别深挖与产业意图', () => {
    expect(detectResearchAgentIntent('深挖节能风电')).toBe('deep_research')
    expect(detectResearchAgentIntent('请启动深度研究茅台')).toBe('deep_research')
    expect(detectResearchAgentIntent('帮我做产业研究光模块')).toBe('industry_research')
    expect(detectResearchAgentIntent('今天天气怎么样')).toBe(null)
  })

  it('产业意图优先于深挖关键词并存时', () => {
    expect(detectResearchAgentIntent('深挖一下产业研究框架')).toBe('industry_research')
  })

  it('busy 判定', () => {
    expect(isSessionResearchBusy([{ status: 'running' }])).toBe(true)
    expect(isSessionResearchBusy([{ status: 'paused' }])).toBe(true)
    expect(isSessionResearchBusy([{ status: 'succeeded' }])).toBe(false)
    expect(isGlobalResearchBusy([{ status: 'queued' }])).toBe(true)
    expect(isGlobalResearchBusy([{ status: 'paused' }])).toBe(false)
  })
})
