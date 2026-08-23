import { useCallback, useEffect, useState } from 'react'
import type { DataRootStatusView } from '../../../electron/main/ipc/dataRootHandlers'

/**
 * FR-265 数据存储区块：展示当前数据目录与来源，支持更改目录（原生选择 +
 * 二次确认 + 重启生效）与恢复默认；env 来源时只读提示。
 */

const SOURCE_LABELS: Record<'env' | 'file', string> = {
  env: '环境变量',
  file: '自定义',
}

export function DataRootSettings() {
  const [status, setStatus] = useState<DataRootStatusView | null>(null)
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [restartNeeded, setRestartNeeded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const loadStatus = useCallback(() => {
    window.api.dataRoot.getStatus().then((response) => {
      if (response.ok) setStatus(response.data)
    })
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  async function handleSelectDirectory() {
    setError(null)
    setInfo(null)
    const response = await window.api.dataRoot.selectDirectory()
    if (!response.ok) {
      setError(response.message)
      return
    }
    if (response.data === null) return
    if (status && response.data === status.currentRoot) {
      setInfo('所选目录与当前数据目录相同，无需更改。')
      return
    }
    setPendingTarget(response.data)
  }

  async function handleConfirmChange() {
    if (!pendingTarget) return
    setApplying(true)
    setError(null)
    setInfo(null)
    const response = await window.api.dataRoot.setCustomRoot(pendingTarget)
    setApplying(false)
    if (response.ok) {
      setPendingTarget(null)
      setRestartNeeded(true)
      setInfo('数据目录已更新，重启应用后生效。')
      loadStatus()
      return
    }
    setPendingTarget(null)
    setError(response.message)
  }

  async function handleRestoreDefault() {
    setApplying(true)
    setError(null)
    setInfo(null)
    const response = await window.api.dataRoot.clearOverride()
    setApplying(false)
    if (response.ok) {
      setRestartNeeded(true)
      setInfo('已恢复默认数据目录，重启应用后生效。')
      loadStatus()
      return
    }
    setError(response.message)
  }

  async function handleRelaunch() {
    await window.api.app.relaunch()
  }

  const sourceLabel = status
    ? status.overrideSource
      ? SOURCE_LABELS[status.overrideSource]
      : '默认'
    : null

  return (
    <section
      data-testid="settings-data-root-section"
      className="mb-6 border-t border-gray-100 dark:border-gray-700 pt-6"
    >
      <h3 className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">数据存储</h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
        本地数据库、资讯缓存与会话档案的存放位置。更改后需重启应用生效；目标为空目录时会自动复制现有数据，期间请勿关闭应用。
      </p>
      {status === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">加载中…</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <code
              data-testid="settings-data-root-path"
              className="max-w-full truncate rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              title={status.currentRoot}
            >
              {status.currentRoot}
            </code>
            {sourceLabel && (
              <span
                data-testid="settings-data-root-source"
                className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
              >
                {sourceLabel}
              </span>
            )}
          </div>
          {status.overrideSource === 'env' ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
              数据目录当前由环境变量 RT_DATA_ROOT 指定，如需更改请修改该环境变量后重启。
            </p>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                data-testid="settings-data-root-change"
                onClick={handleSelectDirectory}
                disabled={applying || restartNeeded}
                className="px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500 transition-colors disabled:opacity-40"
              >
                更改目录…
              </button>
              {status.canRestoreDefault && (
                <button
                  type="button"
                  data-testid="settings-data-root-restore"
                  onClick={handleRestoreDefault}
                  disabled={applying || restartNeeded}
                  className="px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500 transition-colors disabled:opacity-40"
                >
                  恢复默认
                </button>
              )}
            </div>
          )}
          {pendingTarget && (
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
              <p className="text-sm text-gray-700 dark:text-gray-200 mb-1">确认将数据目录更改为：</p>
              <code
                className="block truncate font-mono text-xs text-gray-600 dark:text-gray-300 mb-2"
                title={pendingTarget}
              >
                {pendingTarget}
              </code>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                重启后生效。若目标目录为空，将把现有数据完整复制过去，复制期间应用不可用；目标目录已有应用数据时将直接切换。
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="settings-data-root-confirm"
                  onClick={handleConfirmChange}
                  disabled={applying}
                  className="px-3 py-1.5 rounded bg-blue-500 text-sm text-white hover:bg-blue-600 transition-colors disabled:opacity-40"
                >
                  {applying ? '正在写入…' : '确认更改'}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingTarget(null)}
                  disabled={applying}
                  className="px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500 transition-colors disabled:opacity-40"
                >
                  取消
                </button>
              </div>
            </div>
          )}
          {restartNeeded && (
            <button
              type="button"
              data-testid="settings-data-root-relaunch"
              onClick={handleRelaunch}
              className="mt-3 px-3 py-1.5 rounded bg-cyan-600 text-sm text-white hover:bg-cyan-700 transition-colors"
            >
              立即重启
            </button>
          )}
        </>
      )}
      {info && <p className="text-xs text-green-600 mt-2">{info}</p>}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </section>
  )
}
