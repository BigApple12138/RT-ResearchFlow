import { beforeEach, describe, expect, it } from 'vitest'
import {
  SESSION_DRAWER_LEFT_KEY,
  SESSION_DRAWER_RIGHT_KEY,
  defaultPrefsForSession,
  loadSessionDrawerPrefs,
  saveSessionDrawerPrefs,
  type SessionDrawerStorage,
} from '../../src/components/AIAnalysis/sessionDrawerPrefs'

function memoryStorage(): SessionDrawerStorage & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    setItem: (key, value) => { store.set(key, value) },
    removeItem: (key) => { store.delete(key) },
  }
}

describe('sessionDrawerPrefs', () => {
  let storage: ReturnType<typeof memoryStorage>

  beforeEach(() => {
    storage = memoryStorage()
  })

  it('discussion 默认左开右收；article 左右都开', () => {
    expect(defaultPrefsForSession('discussion')).toEqual({ leftOpen: true, rightOpen: false })
    expect(defaultPrefsForSession('article')).toEqual({ leftOpen: true, rightOpen: true })
  })

  it('无存储时回退 discussion 默认', () => {
    expect(loadSessionDrawerPrefs('discussion', storage)).toEqual({ leftOpen: true, rightOpen: false })
    expect(loadSessionDrawerPrefs('discussion', null)).toEqual({ leftOpen: true, rightOpen: false })
  })

  it('round-trip 保存后可读回', () => {
    saveSessionDrawerPrefs({ leftOpen: false, rightOpen: true }, storage)
    expect(loadSessionDrawerPrefs('discussion', storage)).toEqual({ leftOpen: false, rightOpen: true })
  })

  it('部分更新保留另一侧', () => {
    saveSessionDrawerPrefs({ leftOpen: true, rightOpen: true }, storage)
    saveSessionDrawerPrefs({ rightOpen: false }, storage)
    expect(loadSessionDrawerPrefs('discussion', storage)).toEqual({ leftOpen: true, rightOpen: false })
  })

  it('坏数据回退默认', () => {
    storage.setItem(SESSION_DRAWER_LEFT_KEY, 'yes')
    storage.setItem(SESSION_DRAWER_RIGHT_KEY, '1')
    expect(loadSessionDrawerPrefs('discussion', storage)).toEqual({ leftOpen: true, rightOpen: false })
  })
})
