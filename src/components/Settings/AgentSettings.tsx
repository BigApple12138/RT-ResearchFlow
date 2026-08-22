import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { NotificationToggle } from './Settings'
import { ResearchAccessSettings } from './ResearchAccessSettings'
import { ExternalMcpSettings } from './ExternalMcpSettings'
import { AppWebSearchSettings } from './AppWebSearchSettings'

/**
 * 配置中心「Agent」页信息架构：
 * 1) 本应用联网搜索（观察池/深度研究/Agent 搜索共用）— 主配置
 * 2) Agent 回合联网闸门 — 仅约束聊天里自主调联网工具
 * 3) 本机研究访问 / 外部 MCP 客户端
 */
export function AgentSettings() {
  const { settings, updateSettings } = useAppStore()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  if (!settings) return <div className="p-6 text-sm text-gray-400 dark:text-gray-500">加载中…</div>
  const agentNetworkOn = (settings.ai_agent_network_enabled ?? 0) === 1

  return (
    <div data-testid="agent-settings-panel" className="h-full overflow-y-auto p-5">
      <h2 className="mb-1 text-base font-semibold text-gray-900 dark:text-gray-100">Agent 设置</h2>
      <p className="mb-5 text-xs leading-5 text-slate-500 dark:text-slate-400">
        本页先配<strong className="font-medium text-slate-700 dark:text-slate-200">应用级联网搜索</strong>
        （观察池补充分类、深度研究回退等也会用），再单独控制 Agent 聊天是否可自主调联网工具。
        模型厂商与 Key 仍在「AI 配置」。
      </p>

      <section className="mb-6">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">1. 本应用联网搜索</h3>
          <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            与「允许 Agent 联网」无关：关闭 Agent 联网时，只要此处启用，观察池「联网补充分类」仍走本通道（例如豆包 MCP）。
          </p>
        </div>
        <AppWebSearchSettings variant="agent" />
      </section>

      <section className="mb-6 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">2. Agent 回合联网</h3>
        <p className="mb-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          只约束 AI 分析聊天里 Agent 是否可自主调用联网类 Tool（含投影的外部 MCP）。
          不关闭上方搜索通道，也不影响观察池显式「联网补充分类」。
        </p>
        <div className="border-y border-slate-100 dark:border-slate-800">
          <NotificationToggle
            label="允许 Agent 联网"
            description={
              agentNetworkOn
                ? '已开启：Agent 可按任务调用联网工具；搜索类调用优先走上方「联网搜索」通道。可能产生模型/数据成本。'
                : '已关闭：Agent 回合内新的联网 Tool 会被主进程阻断。上方「联网搜索」仍可供观察池等非 Agent 路径使用。'
            }
            checked={agentNetworkOn}
            onChange={(checked) => { void updateSettings({ ai_agent_network_enabled: checked ? 1 : 0 }) }}
          />
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">3. 本机研究访问</h3>
          <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200">
            推荐 · Cursor / Codex（MCP 服务端）
          </span>
        </div>
        <ResearchAccessSettings />
      </section>

      <section className="mb-2 rounded-md border border-dashed border-slate-300 p-3 dark:border-slate-600">
        <button
          type="button"
          data-testid="agent-settings-advanced-toggle"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">高级 / 实验 · 外部 MCP 客户端</div>
            <p className="mt-0.5 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
              维护 stdio MCP 服务器与密钥；可被上方「联网搜索 → 外部 MCP 工具」选用，也可在 Agent 联网开启后作为投影工具。
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
            {advancedOpen ? '收起' : '展开'}
          </span>
        </button>
        {advancedOpen && (
          <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
            <ExternalMcpSettings />
          </div>
        )}
      </section>
    </div>
  )
}
