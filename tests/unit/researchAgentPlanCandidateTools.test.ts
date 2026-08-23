import { describe, expect, it } from 'vitest'
import { parseResearchAgentPlanAction } from '../../electron/main/services/researchAgentProtocol'

describe('parseResearchAgentPlanAction candidateTools resilience', () => {
  it('模型列出超过8个候选工具时去重并截断到8，而不是整轮失败', () => {
    const tools = [
      'stock.price_history',
      'stock.trend_snapshot',
      'stock.fundamentals',
      'stock.announcements',
      'news.recent_briefings',
      'web.search',
      'web.fetch_page',
      'official.disclosure_search',
      'mcp.invoke',
      'market.price_refresh',
    ]
    const text = JSON.stringify({
      protocolVersion: 'single-agent.v1',
      action: 'plan',
      questions: ['基本面与走势是否背离？'],
      candidateTools: tools,
      stopConditions: ['取得本地价格与基本面事实后停止'],
      rationale: '覆盖本地与补证工具。',
    })
    const plan = parseResearchAgentPlanAction(text)
    expect(plan.candidateTools).toHaveLength(8)
    expect(plan.candidateTools).toEqual(tools.slice(0, 8))
    expect(plan.candidateTools).not.toContain('market.price_refresh')
  })
})
