export type MessageTone = 'info' | 'success' | 'warning' | 'danger'
export type MessageCenterActionKind = 'feed' | 'decision-center' | 'onboarding'

export interface MessageCenterItem {
  id: string
  title: string
  description: string
  source: string
  timeLabel?: string
  tone: MessageTone
  actionLabel?: string
  onAction?: () => void
  /** 持久化事件 id；有则显示「忽略」 */
  persistedId?: string
  fingerprint?: string
}

export function formatBjTime(ms: number | null | undefined): string {
  if (!ms) return '暂无'
  const bjMs = ms + 8 * 60 * 60 * 1000
  const date = new Date(bjMs)
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mm = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function hashFingerprintPart(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

export interface PersistedMessageCenterEvent {
  id: string
  fingerprint: string
  title: string
  description: string
  source: string
  tone: MessageTone
  actionKind: MessageCenterActionKind | null
  createdAt: number
}

export function persistedEventToItem(
  event: PersistedMessageCenterEvent,
  resolveAction: (kind: MessageCenterActionKind | null) => (() => void) | undefined,
): MessageCenterItem {
  const actionKind = event.actionKind
  const onAction = resolveAction(actionKind)
  return {
    id: `persisted:${event.id}`,
    persistedId: event.id,
    fingerprint: event.fingerprint,
    title: event.title,
    description: event.description,
    source: event.source,
    tone: event.tone,
    timeLabel: formatBjTime(event.createdAt),
    actionLabel: actionKind === 'feed'
      ? '打开资讯'
      : actionKind === 'decision-center'
        ? '打开看板'
        : actionKind === 'onboarding'
          ? '查看引导'
          : undefined,
    onAction,
  }
}

/** 实时项优先；与实时同主题的持久项跳过，避免双条。 */
export function mergeLiveAndPersistedMessages(
  live: MessageCenterItem[],
  persisted: MessageCenterItem[],
): MessageCenterItem[] {
  const skipScan = live.some((item) => item.id === 'scan-last')
  const skipInitError = live.some((item) => item.id === 'initialization-error')
  const skipCatchUp = live.some((item) => item.id === 'catch-up-status')
  const extras = persisted.filter((item) => {
    const fp = item.fingerprint ?? ''
    if (skipScan && fp.startsWith('scan-last:')) return false
    if (skipInitError && fp.startsWith('initialization-error:')) return false
    if (skipCatchUp && fp.startsWith('catch-up:')) return false
    return true
  })
  return [...live, ...extras]
}