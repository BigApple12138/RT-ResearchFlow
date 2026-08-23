import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`enc:${plaintext}`, 'utf8'),
    decryptString: (encrypted: Buffer) => {
      const raw = encrypted.toString('utf8')
      if (!raw.startsWith('enc:')) throw new Error('bad cipher')
      return raw.slice(4)
    },
  },
}))

import { runMigrations } from '../../electron/main/database/db'
import { updateAIConfig, setProviderConfig } from '../../electron/main/database/aiConfigRepository'
import { encryptApiKey } from '../../electron/main/utils/apiKeyEncryption'
import {
  resolveForecastProviderIds,
  resolveProviderCredentials,
} from '../../electron/main/services/aiFallbackService'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db)
  return db
}

describe('AI provider resolution for forecast vs discussion', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createDb()
    // Legacy priority/provider unknown; multi-model list empty — mirrors user config check text.
    db.prepare(
      `UPDATE ai_config SET provider = NULL, model = NULL, providerPriority = '[]', multiModelProviders = '[]' WHERE id = 1`,
    ).run()
    const encrypted = encryptApiKey('sk-test-chatgpt')
    expect(encrypted).toBeTruthy()
    setProviderConfig(db, 'chatgpt', {
      apiKeyEncrypted: encrypted!,
      model: 'ark-code-latest',
      baseUrl: 'https://example.invalid/v1',
    })
  })

  it('resolveProviderCredentials finds chatgpt when priority/provider are empty', () => {
    const creds = resolveProviderCredentials(db)
    expect(creds).toMatchObject({
      provider: 'chatgpt',
      model: 'ark-code-latest',
      apiKey: 'sk-test-chatgpt',
    })
  })

  it('resolveForecastProviderIds does not return AI_NOT_CONFIGURED empty list for that case', () => {
    expect(resolveForecastProviderIds(db)).toEqual(['chatgpt'])
  })

  it('resolveForecastProviderIds still prefers explicit multiModelProviders', () => {
    updateAIConfig(db, { multiModelProviders: JSON.stringify(['deepseek']) })
    const deepseekKey = encryptApiKey('sk-deepseek')
    setProviderConfig(db, 'deepseek', {
      apiKeyEncrypted: deepseekKey!,
      model: 'deepseek-chat',
    })
    expect(resolveForecastProviderIds(db)).toEqual(['deepseek'])
  })
})
