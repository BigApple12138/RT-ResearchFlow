import { describe, expect, it } from 'vitest'
import {
  BRIEFING_RELATED_STOCKS_LIMIT,
  extractSixDigitStockCodes,
  extractStockCodesFromProtocol,
  mergeBriefingRelatedStocks,
  stripHtmlToText,
} from '../../src/components/BriefingDetail/briefingRelatedStocksModel'

describe('briefingRelatedStocksModel', () => {
  it('从正文抽取六位代码并去重', () => {
    expect(extractSixDigitStockCodes('关注600519与000001，再见600519')).toEqual(['600519', '000001'])
  })

  it('不把更长数字串拆成伪代码', () => {
    expect(extractSixDigitStockCodes('订单号1234567与电话13800138000')).toEqual([])
  })

  it('解析 STOCK_CODES 协议行', () => {
    const text = '前言\nSTOCK_CODES: 600519.SH|茅台, 000001.SZ\n后文'
    expect(extractStockCodesFromProtocol(text)).toEqual(['600519', '000001'])
  })

  it('stripHtmlToText 去掉标签后再可抽码', () => {
    const text = stripHtmlToText('<p>公司 <b>300750</b> 披露</p>')
    expect(extractSixDigitStockCodes(text)).toEqual(['300750'])
  })

  it('合并时协议与候选优先，正文补充，上限 12', () => {
    const many = Array.from({ length: 15 }, (_, i) => String(600000 + i).padStart(6, '0'))
    const merged = mergeBriefingRelatedStocks({
      protocolTexts: ['STOCK_CODES: 600519'],
      candidateStocks: [{ code: '000001', name: '平安银行' }],
      freeTexts: [`杂讯 ${many.join(' ')}`],
      limit: BRIEFING_RELATED_STOCKS_LIMIT,
    })
    expect(merged[0]).toMatchObject({ code: '600519', tsCode: '600519.SH' })
    expect(merged[1]).toMatchObject({ code: '000001', name: '平安银行', tsCode: '000001.SZ' })
    expect(merged).toHaveLength(12)
  })

  it('同代码后出现的名称可回填', () => {
    const merged = mergeBriefingRelatedStocks({
      freeTexts: ['600519'],
      candidateStocks: [{ code: '600519', name: '贵州茅台' }],
    })
    expect(merged).toEqual([
      { code: '600519', tsCode: '600519.SH', name: '贵州茅台' },
    ])
  })
})
