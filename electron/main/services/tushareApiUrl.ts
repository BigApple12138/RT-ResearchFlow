/** Default Tushare Pro REST endpoint (official). */
export const DEFAULT_TUSHARE_API_URL = 'https://api.tushare.pro'

/**
 * Resolve configured or form API URL to the effective fetch target.
 * Empty / whitespace → official default.
 */
export function resolveTushareApiUrl(raw?: string | null): string {
  const trimmed = (raw ?? '').trim()
  return trimmed.length > 0 ? trimmed : DEFAULT_TUSHARE_API_URL
}

/**
 * Validate user input for persistence.
 * Empty → ok with `url: null` (store null = use default).
 * Non-empty must be http(s) URL.
 */
export function validateTushareApiUrlInput(
  raw: string
): { ok: true; url: string | null } | { ok: false; message: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, url: null }
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, message: 'API 地址须以 http:// 或 https:// 开头' }
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, message: 'API 地址仅支持 http 或 https' }
    }
  } catch {
    return { ok: false, message: 'API 地址格式无效' }
  }
  return { ok: true, url: trimmed }
}
