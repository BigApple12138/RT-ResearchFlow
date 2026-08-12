/**
 * AI 分析页左右抽屉偏好（localStorage，按本机用户机，不进库）。
 * 讨论默认：左开右收；文章默认：左右都开。
 */

export type SessionDrawerKind = 'discussion' | 'article'

export type SessionDrawerPrefs = {
  leftOpen: boolean
  rightOpen: boolean
}

export type SessionDrawerStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem?: (key: string) => void
}

export const SESSION_DRAWER_LEFT_KEY = 'rt-researchflow.ai-analysis.drawer.left'
export const SESSION_DRAWER_RIGHT_KEY = 'rt-researchflow.ai-analysis.drawer.right'

export function defaultPrefsForSession(kind: SessionDrawerKind): SessionDrawerPrefs {
  if (kind === 'discussion') {
    return { leftOpen: true, rightOpen: false }
  }
  return { leftOpen: true, rightOpen: true }
}

function readBool(raw: string | null): boolean | null {
  if (raw === 'true') return true
  if (raw === 'false') return false
  return null
}

function defaultBrowserStorage(): SessionDrawerStorage | null {
  try {
    if (typeof globalThis === 'undefined') return null
    const ls = (globalThis as { localStorage?: SessionDrawerStorage }).localStorage
    if (!ls || typeof ls.getItem !== 'function' || typeof ls.setItem !== 'function') return null
    return ls
  } catch {
    return null
  }
}

function storageGet(storage: SessionDrawerStorage | null, key: string): string | null {
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(storage: SessionDrawerStorage | null, key: string, value: string): void {
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {
    // ignore quota / private mode
  }
}

/**
 * 读取已存偏好；缺 key 时用 discussion 默认（左开右收）。
 * 策略：全局记住左右开关，不按会话类型重置（避免抖动）。
 */
export function loadSessionDrawerPrefs(
  fallbackKind: SessionDrawerKind = 'discussion',
  storage: SessionDrawerStorage | null = defaultBrowserStorage(),
): SessionDrawerPrefs {
  const defaults = defaultPrefsForSession(fallbackKind)
  const left = readBool(storageGet(storage, SESSION_DRAWER_LEFT_KEY))
  const right = readBool(storageGet(storage, SESSION_DRAWER_RIGHT_KEY))
  return {
    leftOpen: left ?? defaults.leftOpen,
    rightOpen: right ?? defaults.rightOpen,
  }
}

export function saveSessionDrawerPrefs(
  partial: Partial<SessionDrawerPrefs>,
  storage: SessionDrawerStorage | null = defaultBrowserStorage(),
): SessionDrawerPrefs {
  const current = loadSessionDrawerPrefs('discussion', storage)
  const next: SessionDrawerPrefs = {
    leftOpen: typeof partial.leftOpen === 'boolean' ? partial.leftOpen : current.leftOpen,
    rightOpen: typeof partial.rightOpen === 'boolean' ? partial.rightOpen : current.rightOpen,
  }
  storageSet(storage, SESSION_DRAWER_LEFT_KEY, String(next.leftOpen))
  storageSet(storage, SESSION_DRAWER_RIGHT_KEY, String(next.rightOpen))
  return next
}
