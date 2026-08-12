import React, { useCallback, useEffect, useState } from 'react'
import type { ExternalMcpServerView, ExternalMcpToolSummary } from '../../../electron/main/ipc/externalMcpHandlers'

const BUTTON = 'min-h-11 rounded border px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-45'
const SECONDARY = `${BUTTON} border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800`
const PRIMARY = `${BUTTON} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`
const DANGER = `${BUTTON} border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-950/40`

interface DraftForm {
  id?: string
  name: string
  command: string
  argsText: string
  cwd: string
  envText: string
  clearEnv: boolean
  enabled: boolean
}

const EMPTY_DRAFT: DraftForm = {
  name: '',
  command: '',
  argsText: '',
  cwd: '',
  envText: '',
  clearEnv: false,
  enabled: true,
}

function parseArgsText(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      throw new Error('参数必须是 JSON 字符串数组，例如 ["-y","pkg"]')
    }
    return parsed as string[]
  }
  return trimmed.split(/\s+/).filter(Boolean)
}

function parseEnvText(raw: string): Record<string, string> | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('环境变量须为 JSON 对象，例如 {"API_KEY":"..."}')
  }
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string') throw new Error(`环境变量 ${key} 的值必须是字符串`)
    env[key] = value
  }
  return env
}

export function ExternalMcpSettings() {
  const [servers, setServers] = useState<ExternalMcpServerView[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState<DraftForm>(EMPTY_DRAFT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [testTools, setTestTools] = useState<Record<string, ExternalMcpToolSummary[]>>({})
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.api.externalMcp.listServers()
    if (result.ok) {
      setServers(result.data)
      setError('')
    } else {
      setError(result.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function beginEdit(server: ExternalMcpServerView) {
    setEditingId(server.id)
    setDraft({
      id: server.id,
      name: server.name,
      command: server.command,
      argsText: JSON.stringify(server.args),
      cwd: server.cwd ?? '',
      envText: '',
      clearEnv: false,
      enabled: server.enabled,
    })
    setNotice(server.hasEnv ? '已保存环境变量不会回显；留空表示保持原值，勾选清除可删除。' : '')
    setError('')
  }

  function resetDraft() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
  }

  async function saveServer() {
    setBusy('save')
    setError('')
    setNotice('')
    try {
      const args = parseArgsText(draft.argsText)
      const payload: Parameters<typeof window.api.externalMcp.saveServer>[0] = {
        name: draft.name.trim(),
        command: draft.command.trim(),
        args,
        cwd: draft.cwd.trim() ? draft.cwd.trim() : null,
        enabled: draft.enabled,
      }
      if (draft.id) payload.id = draft.id
      if (draft.clearEnv) {
        payload.env = null
      } else if (draft.envText.trim()) {
        payload.env = parseEnvText(draft.envText) ?? null
      }
      const result = await window.api.externalMcp.saveServer(payload)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setNotice(draft.id ? '外部 MCP 服务器已更新' : '外部 MCP 服务器已添加')
      resetDraft()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function toggleEnabled(server: ExternalMcpServerView) {
    setBusy(server.id)
    setError('')
    const result = await window.api.externalMcp.setEnabled({
      id: server.id,
      enabled: !server.enabled,
    })
    setBusy(null)
    if (!result.ok) setError(result.message)
    else await load()
  }

  async function testServer(serverId: string) {
    setBusy(`test:${serverId}`)
    setError('')
    setNotice('')
    const result = await window.api.externalMcp.testServer({ id: serverId })
    setBusy(null)
    if (!result.ok) {
      setError(result.message)
      return
    }
    if (result.data.ok) {
      setTestTools((current) => ({ ...current, [serverId]: result.data.tools }))
      setNotice(`连通成功，共 ${result.data.tools.length} 个 tools`)
    } else {
      setError(result.data.error?.message ?? result.data.error?.code ?? '连通失败')
    }
    await load()
  }

  async function deleteServer(serverId: string) {
    setBusy(serverId)
    setError('')
    const result = await window.api.externalMcp.deleteServer({ id: serverId })
    setBusy(null)
    setPendingDeleteId(null)
    if (!result.ok) setError(result.message)
    else {
      if (editingId === serverId) resetDraft()
      setTestTools((current) => {
        const next = { ...current }
        delete next[serverId]
        return next
      })
      await load()
    }
  }

  return (
    <section data-testid="external-mcp-settings" className="mb-6 border-t border-gray-200 pt-6 dark:border-gray-700">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">外部 MCP 客户端</h2>
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
          本面板把本应用配置为 <strong className="font-medium text-gray-700 dark:text-gray-300">MCP 客户端</strong>
          ：由主进程连接你提供的外部 MCP 服务器（stdio），用于后续 Agent 多源取数。环境变量仅在写入时提交，列表不回显明文。
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300/90">
          这与下方「本机研究访问」相反：后者是本机 MCP <em>服务端</em>（把本地只读事实暴露给 Cursor 等外部 Agent），不是外源补数入口。
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-4 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/35 dark:text-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="mb-4 border-l-2 border-emerald-500 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
          {notice}
        </div>
      )}

      <div className="mb-5 grid gap-3 rounded border border-gray-200 p-4 dark:border-gray-700">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-gray-600 dark:text-gray-300">名称</span>
            <input
              data-testid="external-mcp-name"
              value={draft.name}
              maxLength={120}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              className="min-h-11 w-full rounded border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-gray-600 dark:text-gray-300">Command（可执行文件）</span>
            <input
              data-testid="external-mcp-command"
              value={draft.command}
              maxLength={1024}
              placeholder="例如 npx 或绝对路径"
              onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))}
              className="min-h-11 w-full rounded border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
        </div>
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-gray-600 dark:text-gray-300">Args（JSON 数组或空格分隔；禁止 shell 拼接）</span>
          <input
            data-testid="external-mcp-args"
            value={draft.argsText}
            placeholder='["-y","@scope/mcp-server"]'
            onChange={(event) => setDraft((current) => ({ ...current, argsText: event.target.value }))}
            className="min-h-11 w-full rounded border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-gray-600 dark:text-gray-300">工作目录 cwd（可选）</span>
          <input
            data-testid="external-mcp-cwd"
            value={draft.cwd}
            onChange={(event) => setDraft((current) => ({ ...current, cwd: event.target.value }))}
            className="min-h-11 w-full rounded border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-gray-600 dark:text-gray-300">
            环境变量 JSON（可选；仅写入时明文；列表只显示是否已配置）
          </span>
          <textarea
            data-testid="external-mcp-env"
            value={draft.envText}
            rows={3}
            placeholder='{"API_KEY":"..."}'
            onChange={(event) => setDraft((current) => ({ ...current, envText: event.target.value }))}
            className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 dark:text-gray-300">
          <label className="inline-flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
            />
            启用
          </label>
          {editingId && (
            <label className="inline-flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={draft.clearEnv}
                onChange={(event) => setDraft((current) => ({ ...current, clearEnv: event.target.checked }))}
              />
              清除已保存环境变量
            </label>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="external-mcp-save"
            className={PRIMARY}
            disabled={busy != null || !draft.name.trim() || !draft.command.trim()}
            onClick={() => void saveServer()}
          >
            {editingId ? '保存修改' : '添加服务器'}
          </button>
          {editingId && (
            <button type="button" className={SECONDARY} disabled={busy != null} onClick={resetDraft}>
              取消编辑
            </button>
          )}
          <button type="button" className={SECONDARY} disabled={loading || busy != null} onClick={() => void load()}>
            刷新列表
          </button>
        </div>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {loading && servers.length === 0 && (
          <p className="py-3 text-sm text-gray-400">加载中…</p>
        )}
        {!loading && servers.length === 0 && (
          <p className="py-3 text-sm text-gray-400">尚未配置外部 MCP 服务器。</p>
        )}
        {servers.map((server) => {
          const tools = testTools[server.id] ?? server.lastTools ?? []
          return (
            <div key={server.id} data-testid="external-mcp-server" className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium text-gray-800 dark:text-gray-100">{server.name}</h3>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] ${server.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                      {server.enabled ? '已启用' : '已停用'}
                    </span>
                    <span className="text-[11px] text-gray-400">stdio</span>
                    {server.hasEnv && <span className="text-[11px] text-gray-400">已配置 env</span>}
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-gray-500 dark:text-gray-400">
                    {server.command} {server.args.map((arg) => JSON.stringify(arg)).join(' ')}
                  </p>
                  {server.cwd && (
                    <p className="mt-0.5 text-xs text-gray-400">cwd: {server.cwd}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    {server.lastTestedAt
                      ? `最近测试：${new Date(server.lastTestedAt).toLocaleString()}${server.lastErrorCode ? ` · 错误 ${server.lastErrorCode}` : ' · 成功'}`
                      : '尚未测试连通'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={SECONDARY} disabled={busy != null} onClick={() => beginEdit(server)}>
                    编辑
                  </button>
                  <button
                    type="button"
                    className={SECONDARY}
                    disabled={busy != null}
                    onClick={() => void toggleEnabled(server)}
                  >
                    {server.enabled ? '停用' : '启用'}
                  </button>
                  <button
                    type="button"
                    data-testid="external-mcp-test"
                    className={PRIMARY}
                    disabled={busy != null}
                    onClick={() => void testServer(server.id)}
                  >
                    {busy === `test:${server.id}` ? '测试中…' : '连通测试'}
                  </button>
                  {pendingDeleteId === server.id ? (
                    <>
                      <button type="button" className={DANGER} disabled={busy != null} onClick={() => void deleteServer(server.id)}>
                        确认删除
                      </button>
                      <button type="button" className={SECONDARY} disabled={busy != null} onClick={() => setPendingDeleteId(null)}>
                        取消
                      </button>
                    </>
                  ) : (
                    <button type="button" className={DANGER} disabled={busy != null} onClick={() => setPendingDeleteId(server.id)}>
                      删除
                    </button>
                  )}
                </div>
              </div>
              {tools.length > 0 && (
                <ul data-testid="external-mcp-tools" className="mt-3 space-y-1 rounded bg-gray-50 px-3 py-2 text-xs dark:bg-gray-900/60">
                  {tools.map((tool) => (
                    <li key={tool.name}>
                      <span className="font-medium text-gray-700 dark:text-gray-200">{tool.name}</span>
                      {tool.description && (
                        <span className="text-gray-500 dark:text-gray-400"> — {tool.description}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
