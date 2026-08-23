/**
 * Agent 系统提示组装：默认 Skill 正文 + Tool 列表 + 禁止项/协议。
 * 第一期薄实现；完整 SkillLoader 后续再加深。
 */

import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ToolPromptEntry } from './types'

export const DEFAULT_AGENT_SKILL_ID = 'research-assistant'

/** 与 SKILL.md 正文保持同步的兜底（打包后 md 可能不在 __dirname 旁）。 */
export const FALLBACK_RESEARCH_ASSISTANT_SKILL_BODY = `# 投研助手（Research Assistant）

你是本机投研工作台的编排助手，帮助用户基于**本地已有事实**做复盘与研判整理。你**不是**持牌投顾，输出**不构成投资建议**。

## 何时读持仓

- 用户提到「持仓 / 仓位 / 我的股票 / 组合」或需要对照个人持仓时，先调用 \`local.portfolio_facts\`。
- 不要臆造持仓；无数据时如实说明本地无记录。
- 用户点名具体公司/股票（如「看看中石油」）时，优先 \`local.market_snapshot\` / \`local.fundamentals_read\`（或深挖）回答该标的；**禁止**用持仓列表摘要冒充标的研判。

## 何时读行情

- 需要当日涨跌、报价、成交概况时，调用 \`local.market_snapshot\`。
- 优先本地/已授权快照；不要假装实时外网行情。

## 何时读基本面

- 需要财务、估值、已缓存基本面摘要时，调用 \`local.fundamentals_read\`。
- 仅使用已缓存事实；缺失则说明缺口，不要编造数字。

## 何时 deep_start

- 用户明确要求「深挖 / 深度研究 / 写研究报告」或目标明显需要长链路补证时，调用 \`research.deep_start\`。
- 调用后进入等待子代理；不要在未启动深挖时假装已完成深度报告。
- 简单问答、寒暄、单次本地取数即可回答的，不要轻易 deep_start。

## 工作方式

1. 先理解用户目标；复杂目标可分步取数再总结。
2. 能本地解决的优先本地只读工具；需要联网的工具须用户已开启「允许 Agent 联网」。
3. 写操作须等待用户确认；未确认不得声称已写入。
4. 结论须可追溯到工具结果或用户已提供的上下文；证据不足就写明缺口。

## 硬禁止

- **禁止荐股**（含「建议买入/卖出/加仓/减仓某标的」）。
- **禁止给出目标价**或收益承诺。
- **禁止给出仓位指令**或自动交易暗示。
- 不以「稳赚 / 必涨 / 保证」等话术包装观点。
`

export const AGENT_PROMPT_FORBIDDEN_BLOCK = [
  '## 禁止项（硬边界）',
  '- 禁止荐股、禁止给出目标价、禁止仓位指令或自动交易暗示。',
  '- 不构成投资建议；你不是持牌投顾。',
  '- 不得削弱风险提示，不得承诺收益。',
].join('\n')

export const AGENT_PROMPT_PROTOCOL_BLOCK = [
  '## 输出协议（agent-turn.v1）',
  '每轮只输出一个 JSON 对象（不要 Markdown 围栏）：',
  '{"type":"tool","name":"<tool>","args":{...}} 或 {"type":"final","text":"..."}',
  '本地只读工具可直接调用；network 工具需用户已开启「允许 Agent 联网」；write 会触发人工确认。',
  '复杂任务可先用工具取数再 final；简单寒暄可直接 final。',
].join('\n')

export function stripSkillFrontMatter(raw: string): string {
  const fmMatch = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  if (!fmMatch) return raw.trim()
  return raw.slice(fmMatch[0].length).replace(/^\r?\n/, '').trim()
}

export function resolveDefaultAgentSkillPath(cwd = process.cwd()): string {
  return join(cwd, 'electron', 'main', 'agent', 'skills', 'research-assistant', 'SKILL.md')
}

export function loadDefaultAgentSkillBody(options?: {
  skillPath?: string
  cwd?: string
}): string {
  const candidates = [
    options?.skillPath,
    resolveDefaultAgentSkillPath(options?.cwd ?? process.cwd()),
    typeof __dirname !== 'undefined'
      ? join(__dirname, 'skills', 'research-assistant', 'SKILL.md')
      : undefined,
  ].filter((p): p is string => Boolean(p))

  for (const skillPath of candidates) {
    try {
      if (!existsSync(skillPath)) continue
      const raw = readFileSync(skillPath, 'utf-8')
      const body = stripSkillFrontMatter(raw)
      if (body.trim()) return body
    } catch {
      // try next candidate
    }
  }
  return FALLBACK_RESEARCH_ASSISTANT_SKILL_BODY
}

export function skillContentHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex')
}

export function formatToolsForPrompt(tools: ToolPromptEntry[]): string {
  if (tools.length === 0) return '（无）'
  return tools
    .map((t) => `- ${t.name} [${t.sideEffect}]: ${t.description}`)
    .join('\n')
}

export type BuildAgentSystemPromptInput = {
  skillBody: string
  tools: ToolPromptEntry[]
  /** 追加目标/计划等回合上下文 */
  extraSections?: string[]
}

/**
 * system prompt = Skill 正文 + registry.listForPrompt() 工具列表 + 禁止项（+ 协议）。
 */
export function buildAgentSystemPrompt(input: BuildAgentSystemPromptInput): string {
  const sections = [
    input.skillBody.trim(),
    '## 可用工具',
    formatToolsForPrompt(input.tools),
    AGENT_PROMPT_FORBIDDEN_BLOCK,
    AGENT_PROMPT_PROTOCOL_BLOCK,
    ...(input.extraSections ?? []).map((s) => s.trim()).filter(Boolean),
  ]
  return sections.join('\n\n')
}

/** Orchestrator / TurnService 共用的默认组装入口。 */
export function buildDefaultAgentSystemPrompt(
  tools: ToolPromptEntry[],
  extraSections?: string[],
): string {
  return buildAgentSystemPrompt({
    skillBody: loadDefaultAgentSkillBody(),
    tools,
    extraSections,
  })
}
