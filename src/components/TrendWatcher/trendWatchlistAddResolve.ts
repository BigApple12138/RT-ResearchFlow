/** 与主进程 normalizeAshareCode 一致的六位 → tsCode（渲染侧可测） */
export function sixDigitToTsCode(value: string): string | null {
  const stockCode = value.trim().toUpperCase().replace(/\.(SH|SZ|BJ)$/i, '')
  if (!/^\d{6}$/.test(stockCode)) return null
  const isShanghai = /^(600|601|603|605|688|900|110|113|118|127|128|129|131|132)/.test(stockCode)
  const isBeijing = /^(430|830|87|88|89|92)/.test(stockCode)
  const market = isShanghai ? 'SH' : isBeijing ? 'BJ' : 'SZ'
  return `${stockCode}.${market}`
}

export function buildWatchlistEntryFromCodes(
  stockCode: string,
  stockName: string,
): { tsCode: string; name: string } | null {
  const tsCode = sixDigitToTsCode(stockCode)
  if (!tsCode) return null
  const name = stockName.trim() || stockCode.trim()
  return { tsCode, name }
}

/** 字典为空且输入为六位时，下拉合成候选 */
export function syntheticCandidateForSixDigit(keyword: string): { tsCode: string; name: string } | null {
  const tsCode = sixDigitToTsCode(keyword)
  if (!tsCode) return null
  const six = keyword.trim().replace(/\.(SH|SZ|BJ)$/i, '')
  return { tsCode, name: `代码 ${six}` }
}

export function isSyntheticWatchlistName(name: string): boolean {
  return name.trim().startsWith('代码 ')
}
