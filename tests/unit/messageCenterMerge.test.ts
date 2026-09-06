import { describe, expect, it } from 'vitest'
import {
  mergeLiveAndPersistedMessages,
  type MessageCenterItem,
} from '../../src/components/MessageCenter/messageCenterModel'

describe('messageCenter merge', () => {
  it('实时 scan-last 存在时跳过同主题持久项', () => {
    const live: MessageCenterItem[] = [{
      id: 'scan-last',
      title: 'live',
      description: 'd',
      source: '资讯',
      tone: 'success',
    }]
    const persisted: MessageCenterItem[] = [{
      id: 'persisted:1',
      persistedId: '1',
      fingerprint: 'scan-last:2026-08-30',
      title: 'old',
      description: 'd',
      source: '资讯',
      tone: 'success',
    }]
    expect(mergeLiveAndPersistedMessages(live, persisted)).toHaveLength(1)
    expect(mergeLiveAndPersistedMessages([], persisted)).toHaveLength(1)
  })
})
