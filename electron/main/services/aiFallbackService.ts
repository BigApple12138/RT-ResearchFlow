import type Database from 'better-sqlite3'
import {
  getAIConfig,
  getConfiguredProviders,
  getProviderApiKey,
  getProviderConfig,
} from '../database/aiConfigRepository'
import type { AIProvider } from '../database/types'
import { decryptApiKey } from '../utils/apiKeyEncryption'
import { callAIProvider, PROVIDER_MODELS, type AIProviderUsage, type AIWebSearchTrace, type ConversationTurn } from './aiProvider'

export interface ResolvedProviderCredentials {
  provider: AIProvider
  model: string
  apiKey: string
  baseUrl?: string
  maxTokens?: number | null
  presetPrompt?: string
  trendForecastPrompt?: string
  trendForecastMorrowPrompt?: string
}

export interface AIFallbackResult {
  provider: AIProvider
  model: string
  text: string
  usage?: AIProviderUsage
  finishReason?: string | null
  maxTokens?: number | null
  webSearchTrace?: AIWebSearchTrace
}

/** Priority order first, then any remaining configured vendors (same spirit as ai:getConfig). */
function listProviderCandidates(db: Database.Database): string[] {
  const aiConfig = getAIConfig(db)
  const priority: string[] = aiConfig.providerPriority
    ? JSON.parse(aiConfig.providerPriority)
    : (aiConfig.provider ? [aiConfig.provider] : [])
  const configured = getConfiguredProviders(db)
  const seen = new Set<string>()
  const out: string[] = []
  for (const provider of [...priority, ...configured]) {
    if (!provider || seen.has(provider)) continue
    seen.add(provider)
    out.push(provider)
  }
  return out
}

function credentialsFromProvider(
  db: Database.Database,
  provider: string,
): ResolvedProviderCredentials | null {
  const providerConfig = getProviderConfig(db, provider)
  if (!providerConfig?.apiKeyEncrypted) return null
  const apiKey = decryptApiKey(providerConfig.apiKeyEncrypted)
  if (!apiKey) return null
  const model = providerConfig.model || (PROVIDER_MODELS as Record<string, string[]>)[provider]?.[0] || ''
  if (!model) return null
  return {
    provider: provider as AIProvider,
    model,
    apiKey,
    baseUrl: providerConfig.baseUrl ?? undefined,
    maxTokens: providerConfig.maxTokens ?? undefined,
    presetPrompt: providerConfig.presetPrompt ?? undefined,
    trendForecastPrompt: providerConfig.trendForecastPrompt ?? undefined,
    trendForecastMorrowPrompt: providerConfig.trendForecastMorrowPrompt ?? undefined,
  }
}

export function resolveProviderCredentials(db: Database.Database): ResolvedProviderCredentials | null {
  for (const provider of listProviderCandidates(db)) {
    const creds = credentialsFromProvider(db, provider)
    if (creds) return creds
  }

  const aiConfig = getAIConfig(db)
  if (aiConfig.provider && aiConfig.model) {
    const apiKey = decryptApiKey(getProviderApiKey(db, aiConfig.provider))
    if (apiKey) {
      return {
        provider: aiConfig.provider as AIProvider,
        model: aiConfig.model,
        apiKey,
        baseUrl: aiConfig.baseUrl ?? undefined,
      }
    }
  }
  return null
}

/**
 * Providers for batch / multi-model trend forecast.
 * Prefer explicit multiModelProviders; otherwise reuse the same credential resolution as AI discussion.
 */
export function resolveForecastProviderIds(db: Database.Database): string[] {
  const aiConfig = getAIConfig(db)
  const multiModelProviders: string[] = aiConfig.multiModelProviders
    ? (JSON.parse(aiConfig.multiModelProviders) as string[])
    : []
  if (multiModelProviders.length > 0) return multiModelProviders
  const creds = resolveProviderCredentials(db)
  return creds ? [creds.provider] : []
}

export async function callWithFallback(
  db: Database.Database,
  params: {
    prompt?: string
    messages?: ConversationTurn[]
    maxTokens?: number | null
    /** true 时不向厂商请求写入 max_tokens / max_output_tokens，由模型端自行决定 */
    omitOutputTokenLimit?: boolean
    webSearch?: { enabled: boolean; searchContextSize?: 'low' | 'medium' | 'high'; excludedUrls?: string[] }
    nativeWebSearchOnly?: boolean
    /** 流式累计回调；换厂商前由调用方自行 reset UI */
    onDelta?: (accumulated: string) => void
    /** 即将尝试下一厂商时回调（用于 UI reset） */
    onProviderAttempt?: (provider: AIProvider) => void
  },
): Promise<AIFallbackResult> {
  const candidates = listProviderCandidates(db)

  let lastError: Error | null = null
  let encryptedCredentialCount = 0
  let unavailableCredentialCount = 0
  for (const provider of candidates) {
    if (params.nativeWebSearchOnly && provider !== 'chatgpt') continue
    const providerConfig = getProviderConfig(db, provider)
    if (!providerConfig?.apiKeyEncrypted) continue
    encryptedCredentialCount += 1
    const apiKey = decryptApiKey(providerConfig.apiKeyEncrypted)
    if (!apiKey) {
      unavailableCredentialCount += 1
      continue
    }
    const model = providerConfig.model || (PROVIDER_MODELS as Record<string, string[]>)[provider]?.[0] || ''
    if (!model) continue
    try {
      params.onProviderAttempt?.(provider as AIProvider)
      const result = await callAIProvider({
        provider: provider as AIProvider,
        model,
        apiKey,
        baseUrl: providerConfig.baseUrl ?? undefined,
        // 调用方显式 omit 时不再套厂商 maxTokens；否则可用厂商配置，缺省由 resolveMaxTokens→4096
        ...(params.omitOutputTokenLimit
          ? { omitOutputTokenLimit: true }
          : { maxTokens: params.maxTokens ?? providerConfig.maxTokens ?? undefined }),
        prompt: params.prompt,
        messages: params.messages,
        webSearch: params.webSearch,
        onDelta: params.onDelta,
      })
      return {
        provider: provider as AIProvider,
        model,
        text: result.text,
        usage: result.usage,
        finishReason: result.finishReason,
        maxTokens: params.omitOutputTokenLimit ? undefined : (params.maxTokens ?? providerConfig.maxTokens ?? undefined),
        webSearchTrace: result.webSearchTrace,
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.warn(`[callWithFallback] ${provider}/${model} failed:`, lastError.message, '— trying next provider')
    }
  }
  if (!lastError && encryptedCredentialCount > 0 && encryptedCredentialCount === unavailableCredentialCount) {
    throw new Error('AI_CREDENTIALS_UNAVAILABLE')
  }
  if (params.nativeWebSearchOnly) {
    if (lastError?.message === 'AI_WEB_SEARCH_EXCLUDED_SOURCE_USED') {
      throw new Error('GPT 最终引用了已排除来源，本轮结果未保存')
    }
    if (lastError) {
      throw new Error('GPT 原生网页搜索调用失败，请检查当前模型是否支持 Responses API 和 web_search')
    }
    throw new Error('产业研究联网需要配置可用的 ChatGPT 模型和 API Key')
  }
  throw lastError ?? new Error('AI_NOT_CONFIGURED')
}
