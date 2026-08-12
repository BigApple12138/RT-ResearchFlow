import { getAiAgentNetworkEnabled } from '../database/settingsRepository'
import type { ToolDefinition } from './types'

export class AgentNetworkGateError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AgentNetworkGateError'
    this.code = code
  }
}

export interface NetworkGateOptions {
  /**
   * 每次 network Tool 执行前读取「允许 Agent 联网」开关。
   * 注入时优先使用（单测）；未注入则读持久化设置，读取失败视为关闭。
   */
  getNetworkEnabled?: () => boolean
}

function readPersistedNetworkEnabled(): boolean {
  try {
    return getAiAgentNetworkEnabled()
  } catch {
    return false
  }
}

/**
 * network 类 Tool 执行前闸门（AI 分析 Agent Hub）：关闭时抛稳定错误。
 * 不约束观察池「联网补充分类」、产业研究回退检索、经 runAppWebSearch 的深度研究 web.search。
 * read / write 不受本闸门约束。
 */
export function assertNetworkAllowed(
  def: Pick<ToolDefinition, 'name' | 'sideEffect'>,
  options: NetworkGateOptions = {},
): void {
  if (def.sideEffect !== 'network') {
    return
  }

  const enabled = options.getNetworkEnabled
    ? options.getNetworkEnabled()
    : readPersistedNetworkEnabled()
  if (!enabled) {
    throw new AgentNetworkGateError(
      'NETWORK_DISABLED',
      `联网未授权：工具「${def.name}」需要在配置中心 → Agent 开启「允许 Agent 联网」后才能执行`,
    )
  }
}
