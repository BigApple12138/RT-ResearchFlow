import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TUSHARE_API_URL,
  resolveTushareApiUrl,
  validateTushareApiUrlInput
} from '../../electron/main/services/tushareApiUrl'

describe('tushareApiUrl', () => {
  it('resolve: empty → official default', () => {
    expect(resolveTushareApiUrl(null)).toBe(DEFAULT_TUSHARE_API_URL)
    expect(resolveTushareApiUrl(undefined)).toBe(DEFAULT_TUSHARE_API_URL)
    expect(resolveTushareApiUrl('')).toBe(DEFAULT_TUSHARE_API_URL)
    expect(resolveTushareApiUrl('   ')).toBe(DEFAULT_TUSHARE_API_URL)
  })

  it('resolve: keeps custom http(s) gateway', () => {
    expect(resolveTushareApiUrl('http://127.0.0.1:24629')).toBe('http://127.0.0.1:24629')
    expect(resolveTushareApiUrl(' https://proxy.example/api ')).toBe('https://proxy.example/api')
  })

  it('validate: empty stores null', () => {
    expect(validateTushareApiUrlInput('')).toEqual({ ok: true, url: null })
    expect(validateTushareApiUrlInput('  ')).toEqual({ ok: true, url: null })
  })

  it('validate: accepts http and https', () => {
    expect(validateTushareApiUrlInput('http://165.99.43.204:24629')).toEqual({
      ok: true,
      url: 'http://165.99.43.204:24629'
    })
    expect(validateTushareApiUrlInput('https://api.tushare.pro')).toEqual({
      ok: true,
      url: 'https://api.tushare.pro'
    })
  })

  it('validate: rejects non-http(s)', () => {
    expect(validateTushareApiUrlInput('file:///tmp/x').ok).toBe(false)
    expect(validateTushareApiUrlInput('api.tushare.pro').ok).toBe(false)
    expect(validateTushareApiUrlInput('ftp://x').ok).toBe(false)
  })
})
