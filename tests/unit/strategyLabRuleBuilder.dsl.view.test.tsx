import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createDefaultDailyDslTemplate } from '../../electron/main/services/dailyDsl/types'
import { DailyDslRuleEditor } from '../../src/components/ShortTermStrategy/StrategyLab/DailyDslRuleEditor'
import { updateDslBlock } from '../../src/components/ShortTermStrategy/StrategyLab/dailyDslRuleModel'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('DailyDslRuleEditor 视图', () => {
  it('渲染日线编辑器与快照参数（minPctChg=3）', () => {
    const template = createDefaultDailyDslTemplate()
    const output = renderToStaticMarkup(createElement(DailyDslRuleEditor, {
      template,
      onChange: () => {},
    }))
    expect(output).toContain('data-testid="daily-dsl-rule-editor"')
    expect(output).toContain('data-param-key="minPctChg"')
    expect(output).toContain('value="3"')
    expect(output).toContain('近5日涨幅')
    expect(output).toContain('站上均线')
  })

  it('禁用块不渲染参数输入', () => {
    const template = createDefaultDailyDslTemplate()
    const pct = template.root.children[0]
    if (!('type' in pct)) throw new Error('expected block')
    template.root = updateDslBlock(template.root, pct.id, { enabled: false })
    const output = renderToStaticMarkup(createElement(DailyDslRuleEditor, {
      template,
      onChange: () => {},
    }))
    const disabledMarker = `data-testid="daily-dsl-block-${pct.id}"`
    const start = output.indexOf(disabledMarker)
    expect(start).toBeGreaterThanOrEqual(0)
    const disabledSection = output.slice(start)
    const nextArticle = disabledSection.indexOf('<article', 1)
    const section = nextArticle >= 0 ? disabledSection.slice(0, nextArticle) : disabledSection
    expect(section).not.toContain('data-param-key="minPctChg"')
    expect(output).toContain('data-param-key="maPeriod"')
  })

  it('参数改动经 onChange 回传新值', () => {
    const template = createDefaultDailyDslTemplate()
    const pct = template.root.children[0]
    if (!('type' in pct)) throw new Error('expected block')
    const onChange = vi.fn()
    // 纯函数层验证编辑路径（无 DOM 事件库时）
    const nextRoot = updateDslBlock(template.root, pct.id, {
      params: { ...pct.params, minPctChg: 5 },
    })
    onChange({ ...template, root: nextRoot })
    expect(onChange).toHaveBeenCalledTimes(1)
    const arg = onChange.mock.calls[0][0]
    const child = arg.root.children[0]
    expect(child.params.minPctChg).toBe(5)
  })
})

describe('StrategyRuleBuilder DSL 止损契约', () => {
  it('加载分流用 resolveRuleKind，保存走 buildSavePayload，不再硬编码 conditionBlocks', () => {
    const builder = source('src/components/ShortTermStrategy/StrategyLab/StrategyRuleBuilder.tsx')
    expect(builder).toContain('resolveRuleKind')
    expect(builder).toContain('buildDslStateFromDetail')
    expect(builder).toContain('buildSavePayload')
    expect(builder).toContain('DailyDslRuleEditor')
    expect(builder).toContain('配置 · 日线 DSL')
    expect(builder).toContain('配置 · 两阶段')
    expect(builder).toContain('请新建「日线 DSL」策略')
    expect(builder).not.toContain('日线信号参数化和真正两阶段组合将在下一批实现')
    // 分钟路径仍可写 conditionBlocks；DSL 路径不得把 source 改写为 conditionBlocks
    expect(builder).toContain("ruleKind === 'dailyDsl' || state.ruleKind === 'twoPhase'")
    expect(source('src/components/ShortTermStrategy/StrategyLab/DailyDslRuleEditor.tsx')).toContain('data-testid="daily-dsl-rule-editor"')
  })
})
