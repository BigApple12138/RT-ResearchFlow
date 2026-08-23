import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { ExternalMcpServerView, ExternalMcpToolSummary } from '../../../electron/main/ipc/externalMcpHandlers'

type WebSearchProviderId =
  | 'tavily'
  | 'bing'
  | 'custom_openai_compatible_search'
  | 'external_mcp'
  | 'builtin_web'

interface WebSearchConfigView {
  providerId: WebSearchProviderId
  enabled: boolean
  hasApiKey: boolean
  baseUrl: string | null
  mcpServerId: string | null
  mcpToolName: string | null
  lastValidatedAt: number | null
  lastErrorCode: string | null
}

interface ApiResponse<T> {
  ok: boolean
  data?: T
  code?: string
  message?: string
}

const PROVIDER_OPTIONS: Array<{ id: WebSearchProviderId; label: string; hint: string }> = [
  { id: 'tavily', label: 'Tavily', hint: '通用网页搜索 API' },
  { id: 'bing', label: 'Bing Web Search', hint: '微软搜索 API' },
  { id: 'custom_openai_compatible_search', label: '自定义兼容搜索', hint: 'OpenAI 兼容 /search 端点' },
  { id: 'external_mcp', label: '外部 MCP 工具', hint: '例如已配置的豆包搜索 web_search；密钥在「高级 / 实验」维护' },
  { id: 'builtin_web', label: '内置弱检索', hint: 'DuckDuckGo HTML，无 Key；国内可能不稳定' },
]

function formatValidatedAt(value: number | null): string {
  if (!value) return '尚未校验'
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return '尚未校验'
  }
}

function statusMeta(config: WebSearchConfigView | null): { label: string; className: string; text: string } {
  if (!config) {
    return {
      label: '读取中',
      className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
      text: '正在读取联网搜索配置…',
    }
  }
  const providerLabel = PROVIDER_OPTIONS.find((item) => item.id === config.providerId)?.label || config.providerId
  if (config.enabled && !config.lastErrorCode) {
    return {
      label: '已启用',
      className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
      text: `${providerLabel} · 最近校验：${formatValidatedAt(config.lastValidatedAt)}`,
    }
  }
  if (config.enabled && config.lastErrorCode) {
    return {
      label: '需修复',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
      text: `${providerLabel} 已启用，但最近校验失败（${config.lastErrorCode}）。`,
    }
  }
  return {
    label: '未启用',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    text: '未启用时，观察池联网补充会降级内置弱检索；深度研究回退同理。',
  }
}

interface Props {
  variant?: 'compact' | 'banner' | 'agent'
  className?: string
  defaultExpanded?: boolean
  onConfigured?: (config: WebSearchConfigView) => void
}

/**
 * 本应用联网搜索（单一真相源）。可挂在 Agent 页与产业研究内。
 */
export function AppWebSearchSettings({
  variant = 'agent',
  className = '',
  defaultExpanded = false,
  onConfigured,
}: Props): React.ReactElement {
  const [config, setConfig] = useState<WebSearchConfigView | null>(null)
  const [expanded, setExpanded] = useState(defaultExpanded || variant === 'agent')
  const [providerId, setProviderId] = useState<WebSearchProviderId>('tavily')
  const [enabled, setEnabled] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [mcpServerId, setMcpServerId] = useState('')
  const [mcpToolName, setMcpToolName] = useState('')
  const [mcpServers, setMcpServers] = useState<ExternalMcpServerView[]>([])
  const [mcpTools, setMcpTools] = useState<ExternalMcpToolSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadMcpServers = useCallback(async () => {
    const result = await window.api.externalMcp.listServers()
    if (!result.ok) return
    const enabledServers = result.data.filter((item) => item.enabled)
    setMcpServers(enabledServers)
  }, [])

  const loadConfig = useCallback(async () => {
    const response = await window.api.industryResearch.getWebSearchConfig() as ApiResponse<WebSearchConfigView>
    if (!response.ok || !response.data) {
      setError(response.message || response.code || '读取搜索配置失败')
      return
    }
    setConfig(response.data)
    setProviderId(response.data.providerId || 'tavily')
    setEnabled(response.data.enabled)
    setBaseUrl(response.data.baseUrl || '')
    setMcpServerId(response.data.mcpServerId || '')
    setMcpToolName(response.data.mcpToolName || '')
    setApiKey('')
    onConfigured?.(response.data)
  }, [onConfigured])

  useEffect(() => {
    void loadConfig()
    void loadMcpServers()
  }, [loadConfig, loadMcpServers])

  useEffect(() => {
    if (providerId !== 'external_mcp' || !mcpServerId) {
      setMcpTools([])
      return
    }
    const server = mcpServers.find((item) => item.id === mcpServerId)
    setMcpTools(server?.lastTools ?? [])
  }, [mcpServerId, mcpServers, providerId])

  const refreshMcpTools = useCallback(async () => {
    if (!mcpServerId) return
    setBusy(true)
    setError(null)
    const result = await window.api.externalMcp.testServer({ id: mcpServerId })
    setBusy(false)
    if (!result.ok) {
      setError(result.message || '刷新 MCP tools 失败')
      return
    }
    const tools = result.data.tools ?? []
    setMcpTools(tools)
    await loadMcpServers()
    if (!mcpToolName && tools.length) {
      const preferred = tools.find((tool) => /search/i.test(tool.name)) ?? tools[0]
      setMcpToolName(preferred.name)
    }
    setMessage(`已刷新 ${tools.length} 个工具`)
  }, [loadMcpServers, mcpServerId, mcpToolName])

  const saveConfig = useCallback(async (alsoValidate: boolean) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    // 测试连接时必须启用通道，否则 validate 会报未配置
    const effectiveEnabled = alsoValidate ? true : enabled
    if (alsoValidate && !enabled) setEnabled(true)
    const payload: {
      providerId: WebSearchProviderId
      enabled: boolean
      apiKey?: string | null
      baseUrl?: string | null
      mcpServerId?: string | null
      mcpToolName?: string | null
    } = {
      providerId,
      enabled: effectiveEnabled,
      baseUrl: providerId === 'custom_openai_compatible_search' ? (baseUrl.trim() || null) : null,
      mcpServerId: providerId === 'external_mcp' ? (mcpServerId.trim() || null) : null,
      mcpToolName: providerId === 'external_mcp' ? (mcpToolName.trim() || null) : null,
    }
    if (providerId === 'tavily' || providerId === 'bing' || providerId === 'custom_openai_compatible_search') {
      if (apiKey.trim()) payload.apiKey = apiKey.trim()
    } else {
      payload.apiKey = null
    }

    const saveResponse = await window.api.industryResearch.saveWebSearchConfig(payload) as ApiResponse<WebSearchConfigView>
    if (!saveResponse.ok || !saveResponse.data) {
      setBusy(false)
      setError(saveResponse.message || saveResponse.code || '保存搜索配置失败')
      return
    }
    setConfig(saveResponse.data)
    setEnabled(saveResponse.data.enabled)
    setApiKey('')
    onConfigured?.(saveResponse.data)

    if (!alsoValidate) {
      setBusy(false)
      setMessage(effectiveEnabled ? '已保存并启用联网搜索' : '已保存（通道未启用；观察池仍会降级内置弱检索）')
      return
    }

    const validateResponse = await window.api.industryResearch.validateWebSearchConfig() as ApiResponse<{ ok: true; validatedAt: number }>
    setBusy(false)
    if (!validateResponse.ok) {
      setError(validateResponse.message || validateResponse.code || '搜索配置校验失败')
      await loadConfig()
      return
    }
    setMessage('连接测试通过，联网搜索已可用')
    await loadConfig()
  }, [apiKey, baseUrl, enabled, loadConfig, mcpServerId, mcpToolName, onConfigured, providerId])

  const meta = statusMeta(config)
  const needsCustomBase = providerId === 'custom_openai_compatible_search'
  const needsApiKey = providerId === 'tavily' || providerId === 'bing' || providerId === 'custom_openai_compatible_search'
  const needsMcp = providerId === 'external_mcp'

  const canSave = useMemo(() => {
    if (busy) return false
    if (needsCustomBase && !baseUrl.trim() && !config?.baseUrl) return false
    if (needsMcp && (!mcpServerId.trim() || !mcpToolName.trim())) return false
    if (needsApiKey && !apiKey.trim() && !config?.hasApiKey) return false
    return true
  }, [apiKey, baseUrl, busy, config?.baseUrl, config?.hasApiKey, mcpServerId, mcpToolName, needsApiKey, needsCustomBase, needsMcp])

  if (variant === 'banner' && !expanded) {
    return (
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300 ${className}`}>
        <div className="min-w-0">
          <span className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}>{meta.label}</span>
          <span>{meta.text}</span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          配置联网搜索
        </button>
      </div>
    )
  }

  return (
    <section
      data-testid="app-web-search-settings"
      className={`rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">联网搜索</h4>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}>{meta.label}</span>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{meta.text}</p>
        </div>
        {variant === 'banner' && (
          <button type="button" onClick={() => setExpanded(false)} className="text-[11px] text-slate-500">
            收起
          </button>
        )}
      </div>

      {(expanded || variant === 'agent') && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-[11px] leading-5 text-slate-400">
            应用级搜索通道：观察池「联网补充分类」、深度研究回退检索优先使用本配置；
            Agent 聊天里的搜索类调用在「允许 Agent 联网」开启时也会走这里。请显式选择通道，不会自动乱跳。
            {variant !== 'agent' ? ' 主入口：配置中心 → Agent → 本应用联网搜索。' : ''}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">搜索通道</span>
              <select
                data-testid="app-web-search-provider"
                value={providerId}
                onChange={(event) => {
                  setProviderId(event.target.value as WebSearchProviderId)
                  setError(null)
                }}
                className="min-h-11 w-full rounded border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                {PROVIDER_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="flex min-h-11 items-end gap-2 pb-2 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
              启用此通道
            </label>
          </div>

          {needsApiKey && (
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">
                {config?.hasApiKey ? 'API Key（已配置，留空表示不修改）' : 'API Key'}
              </span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                className="min-h-11 w-full rounded border border-gray-200 bg-white px-3 font-mono text-sm dark:border-gray-700 dark:bg-gray-900"
                placeholder={config?.hasApiKey ? '••••••••' : '粘贴 API Key'}
                autoComplete="off"
              />
            </label>
          )}

          {needsCustomBase && (
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Base URL</span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                className="min-h-11 w-full rounded border border-gray-200 bg-white px-3 font-mono text-sm dark:border-gray-700 dark:bg-gray-900"
                placeholder="例如 https://example.com/v1"
              />
            </label>
          )}

          {needsMcp && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">外部 MCP 服务器</span>
                <select
                  data-testid="app-web-search-mcp-server"
                  value={mcpServerId}
                  onChange={(event) => {
                    setMcpServerId(event.target.value)
                    setMcpToolName('')
                  }}
                  className="min-h-11 w-full rounded border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">请选择已启用的服务器</option>
                  {mcpServers.map((server) => (
                    <option key={server.id} value={server.id}>{server.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                <span className="mb-1 flex items-center justify-between font-medium text-slate-600 dark:text-slate-300">
                  <span>工具名</span>
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-cyan-700 disabled:opacity-40 dark:text-cyan-300"
                    disabled={!mcpServerId || busy}
                    onClick={() => void refreshMcpTools()}
                  >
                    刷新 tools
                  </button>
                </span>
                {mcpTools.length > 0 ? (
                  <select
                    data-testid="app-web-search-mcp-tool"
                    value={mcpToolName}
                    onChange={(event) => setMcpToolName(event.target.value)}
                    className="min-h-11 w-full rounded border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                  >
                    <option value="">请选择工具</option>
                    {mcpTools.map((tool) => (
                      <option key={tool.name} value={tool.name}>{tool.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    data-testid="app-web-search-mcp-tool"
                    value={mcpToolName}
                    onChange={(event) => setMcpToolName(event.target.value)}
                    className="min-h-11 w-full rounded border border-gray-200 bg-white px-3 font-mono text-sm dark:border-gray-700 dark:bg-gray-900"
                    placeholder="例如 web_search"
                  />
                )}
              </label>
            </div>
          )}

          <div className="text-[11px] text-slate-400">
            {PROVIDER_OPTIONS.find((item) => item.id === providerId)?.hint}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canSave}
              onClick={() => void saveConfig(false)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-[11px] disabled:opacity-40 dark:border-slate-700"
            >
              {busy ? '处理中…' : '仅保存'}
            </button>
            <button
              type="button"
              data-testid="app-web-search-validate"
              disabled={!canSave}
              onClick={() => void saveConfig(true)}
              className="rounded-md bg-cyan-700 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              {busy ? '处理中…' : '保存并测试连接'}
            </button>
          </div>
          {message && <div className="text-[11px] text-emerald-700 dark:text-emerald-300">{message}</div>}
          {error && <div role="alert" className="text-[11px] text-red-600 dark:text-red-300">{error}</div>}
        </div>
      )}
    </section>
  )
}

/** @deprecated 名称兼容：产业研究旧引用 */
export const ResearchWebSearchConfigPanel = AppWebSearchSettings
