import { describe, expect, it } from 'vitest'
import {
  buildOfficialDisclosureWebQuery,
  OFFICIAL_DISCLOSURE_WEB_DOMAIN_ROOTS,
} from '../../electron/main/services/researchAgentNetworkTools'

describe('buildOfficialDisclosureWebQuery', () => {
  it('uses short exchange/cninfo sites and omits long gov OR list', () => {
    const query = buildOfficialDisclosureWebQuery('成都路桥 业绩预告', ['www.example-corp.com'])
    expect(query.startsWith('成都路桥 业绩预告 (')).toBe(true)
    for (const domain of OFFICIAL_DISCLOSURE_WEB_DOMAIN_ROOTS) {
      expect(query).toContain(`site:${domain}`)
    }
    expect(query).toContain('site:www.example-corp.com')
    expect(query).not.toContain('site:gov.cn')
    expect(query).not.toContain('site:miit.gov.cn')
    expect(query).not.toContain('site:stats.gov.cn')
    expect(query).not.toContain('site:csrc.gov.cn')
  })
})
