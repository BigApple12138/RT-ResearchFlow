/**

 * 加股后 / 打开抽屉前：本地基本面 missing 时后台补齐公开资料。

 * Spec: docs/superpowers/specs/2026-08-11-auto-prefetch-fundamentals-design.md

 */



export async function prefetchStockFundamentalsIfMissing(stockCode: string): Promise<void> {

  const code = String(stockCode ?? '').trim()

  if (!/^\d{6}/.test(code)) return

  const api = (window.api as typeof window.api & {

    stockFundamentals?: typeof window.api.stockFundamentals

  }).stockFundamentals

  if (!api?.get || !api?.refresh) return



  try {

    const local = await api.get(code)

    if (!local.ok) {

      void api.refresh(code).catch(() => {})

      return

    }

    if (local.snapshot?.status === 'missing') {

      void api.refresh(code).catch(() => {})

    }

  } catch {

    void api.refresh(code).catch(() => {})

  }

}


