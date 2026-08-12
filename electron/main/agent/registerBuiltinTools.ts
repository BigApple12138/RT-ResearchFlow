import type Database from 'better-sqlite3'
import { getDb } from '../database/db'
import type { ToolRegistry } from './toolRegistry'
import {
  createDefaultLocalFundamentalsReadDeps,
  createLocalFundamentalsReadTool,
} from './tools/localFundamentalsRead'
import {
  createDefaultLocalMarketSnapshotDeps,
  createLocalMarketSnapshotTool,
} from './tools/localMarketSnapshot'
import {
  createDefaultLocalPortfolioFactsDeps,
  createLocalPortfolioFactsTool,
} from './tools/localPortfolioFacts'

export interface RegisterBuiltinToolsOptions {
  /** 可注入 DB，便于单测；默认 getDb() */
  getDb?: () => Database.Database
}

/**
 * 注册第一期种子 Tool（本地只读）。
 * research.deep_start 由 agentRuntime.getAgentToolRegistry 另行注册并绑定 RunManager。
 * 主进程初始化时应调用 getAgentToolRegistry()（或本函数 + deep_start）。
 */
export function registerBuiltinTools(
  registry: ToolRegistry,
  options: RegisterBuiltinToolsOptions = {},
): void {
  const dbProvider = options.getDb ?? getDb
  registry.register(createLocalPortfolioFactsTool(createDefaultLocalPortfolioFactsDeps(dbProvider)))
  registry.register(createLocalMarketSnapshotTool(createDefaultLocalMarketSnapshotDeps()))
  registry.register(createLocalFundamentalsReadTool(createDefaultLocalFundamentalsReadDeps(dbProvider)))
}
