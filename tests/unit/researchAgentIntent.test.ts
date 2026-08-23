import { describe, expect, it } from 'vitest'
import {
  detectResearchAgentIntent,
  isGlobalResearchBusy,
  isSessionResearchBusy,
  buildAutoDeepResearchQuestion,
  decideAutoDeepResearchStart,
  extractTsCodesFromText,
  resolveAutoDeepResearchStocks,
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

  it('短意图自动扩写到可提交长度', () => {
    const question = buildAutoDeepResearchQuestion({
      seedQuestion: '深度研究走势',
      stockLabels: ['节能风电(601016.SH)'],
    })
    expect(question.length).toBeGreaterThanOrEqual(10)
    expect(question).toContain('601016')
    expect(question).toContain('深度研究走势')
  })

  it('已够长则保留原文', () => {
    const seed = '请对节能风电做深度研究并给出证据缺口'
    expect(buildAutoDeepResearchQuestion({ seedQuestion: seed, stockLabels: [] })).toBe(seed)
  })

  it('从括号内六位代码抽取主体', () => {
    expect(extractTsCodesFromText('对节能风电（中节能风力发电股份有限公司）(601016)做深度研究').map((s) => s.tsCode))
      .toEqual(['601016.SH'])
    expect(extractTsCodesFromText('看看 000001.SZ 和 600519.SH').map((s) => s.tsCode))
      .toEqual(['000001.SZ', '600519.SH'])
  })

  it('会话正文优先于预检股票', () => {
    const resolved = resolveAutoDeepResearchStocks({
      preflightStocks: [{ kind: 'stock', tsCode: '600519.SH', label: null }],
      corpusTexts: ['节能风电(601016)', '深度研究走势'],
    })
    expect(resolved.map((s) => s.tsCode)).toEqual(['601016.SH'])
  })

  it('有股票或项目且预检就绪才自动启动', () => {
    expect(decideAutoDeepResearchStart({
      preflightReady: true,
      stockCount: 1,
      projectCount: 0,
    })).toEqual({ auto: true })
    expect(decideAutoDeepResearchStart({
      preflightReady: true,
      stockCount: 0,
      projectCount: 1,
    })).toEqual({ auto: true })
    expect(decideAutoDeepResearchStart({
      preflightReady: true,
      stockCount: 0,
      projectCount: 0,
    }).auto).toBe(false)
  })
})
