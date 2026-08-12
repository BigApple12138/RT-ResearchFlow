/** Renderer 侧 A 股代码规范化（与主进程 bridge 对齐）。 */
export function normalizeAshareTsCode(tsCode: string): string {
  const clean = tsCode.trim().toUpperCase()
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(clean)) return clean
  const code = clean.replace(/\.(SH|SZ|BJ)$/i, '')
  if (!/^\d{6}$/.test(code)) return clean
  if (/^(600|601|603|605|688|900|110|113|118|127|128|129|131|132)/.test(code)) return `${code}.SH`
  if (/^(430|830|870|871|872|873|874|875|876|877|878|879|880|881|882|883|884|885|886|887|888|889|890|891|892|893|894|895|896|897|898|899)/.test(code)) {
    return `${code}.BJ`
  }
  return `${code}.SZ`
}
