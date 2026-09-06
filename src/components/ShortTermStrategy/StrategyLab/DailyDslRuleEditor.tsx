import React from 'react'
import {
  DAILY_DSL_PARAMETER_DEFS,
  isDailyDslBlock,
  type DailyDslBlock,
  type DailyDslGroup,
  type DailyDslTemplate,
} from '../../../../electron/main/services/dailyDsl/types'
import {
  DSL_SIDE_OPTIONS,
  summarizeDailyDslGroup,
  summarizeDslBlock,
  updateDslBlock,
} from './dailyDslRuleModel'

interface DailyDslRuleEditorProps {
  template: DailyDslTemplate
  onChange: (template: DailyDslTemplate) => void
  disabled?: boolean
}

function DslBlockRow({
  block,
  executionMode,
  disabled,
  root,
  onRootChange,
}: {
  block: DailyDslBlock
  executionMode: 'strict' | 'score'
  disabled?: boolean
  root: DailyDslGroup
  onRootChange: (root: DailyDslGroup) => void
}): JSX.Element {
  const definitions = DAILY_DSL_PARAMETER_DEFS[block.type] ?? []
  const update = (patch: Partial<DailyDslBlock>) => onRootChange(updateDslBlock(root, block.id, patch))

  return (
    <article
      data-dsl-type={block.type}
      data-testid={`daily-dsl-block-${block.id}`}
      className={'rounded-md border px-3 py-3 transition-colors duration-200 ' + (block.enabled
        ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
        : 'border-dashed border-slate-300 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/50')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={`${block.name}启用状态`}
          type="checkbox"
          checked={block.enabled}
          disabled={disabled}
          onChange={event => update({ enabled: event.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
        />
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{block.name}</span>
        <span className="min-w-0 flex-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{summarizeDslBlock(block)}</span>
        {!block.enabled && (
          <span className="rounded bg-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">已停用</span>
        )}
      </div>
      {block.enabled && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {definitions.map(definition => {
            if (definition.key === 'side') {
              return (
                <label key={definition.key} className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {definition.label}
                  <select
                    data-param-key={definition.key}
                    value={String(block.params[definition.key] ?? definition.defaultValue)}
                    disabled={disabled}
                    onChange={event => update({ params: { ...block.params, [definition.key]: event.target.value } })}
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {DSL_SIDE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
              )
            }
            return (
              <label key={definition.key} className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {definition.label}
                <div className="mt-1 flex h-10 overflow-hidden rounded-md border border-slate-200 bg-white focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-950">
                  <input
                    type="number"
                    data-param-key={definition.key}
                    value={String(block.params[definition.key] ?? definition.defaultValue)}
                    min={definition.min}
                    max={definition.max}
                    step={definition.step}
                    disabled={disabled}
                    onChange={event => update({ params: { ...block.params, [definition.key]: Number(event.target.value) } })}
                    className="min-w-0 flex-1 bg-transparent px-3 text-sm tabular-nums text-slate-800 outline-none disabled:cursor-not-allowed dark:text-slate-100"
                  />
                  {definition.unit && (
                    <span className="flex items-center border-l border-slate-200 bg-slate-50 px-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                      {definition.unit}
                    </span>
                  )}
                </div>
                <span className="mt-1 block font-normal text-slate-400">
                  范围 {definition.min ?? '不限'} - {definition.max ?? '不限'}
                </span>
              </label>
            )
          })}
          {executionMode === 'score' && (
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              条件权重
              <div className="mt-1 flex h-10 overflow-hidden rounded-md border border-slate-200 bg-white focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-950">
                <input
                  type="number"
                  data-param-key="weight"
                  value={block.weight}
                  min={0}
                  max={100}
                  step={1}
                  disabled={disabled}
                  onChange={event => update({ weight: Number(event.target.value) })}
                  className="min-w-0 flex-1 bg-transparent px-3 text-sm tabular-nums text-slate-800 outline-none disabled:cursor-not-allowed dark:text-slate-100"
                />
                <span className="flex items-center border-l border-slate-200 bg-slate-50 px-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900">分</span>
              </div>
            </label>
          )}
        </div>
      )}
    </article>
  )
}

export function DailyDslRuleEditor({ template, onChange, disabled }: DailyDslRuleEditorProps): JSX.Element {
  const root = template.root
  const blocks = root.children.filter(isDailyDslBlock)

  return (
    <div data-testid="daily-dsl-rule-editor" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">按参数定义编辑日线条件；未启用条件不参与求值。</p>
        <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-950" role="group" aria-label="日线执行模式">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...template, executionMode: 'strict' })}
            className={'min-h-9 rounded px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/30 ' + (template.executionMode === 'strict'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100')}
          >
            严格模式
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...template, executionMode: 'score' })}
            className={'min-h-9 rounded px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/30 ' + (template.executionMode === 'score'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100')}
          >
            评分模式
          </button>
        </div>
      </div>
      {template.executionMode === 'score' && (
        <label className="block max-w-xs text-xs font-medium text-slate-600 dark:text-slate-300">
          总分命中阈值
          <div className="mt-1 flex h-10 overflow-hidden rounded-md border border-slate-200 bg-white focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-950">
            <input
              type="number"
              data-testid="daily-dsl-score-threshold"
              min={0}
              max={100}
              step={1}
              value={template.scoreThreshold}
              disabled={disabled}
              onChange={event => onChange({ ...template, scoreThreshold: Number(event.target.value) })}
              className="min-w-0 flex-1 bg-transparent px-3 text-sm tabular-nums text-slate-800 outline-none dark:text-slate-100"
            />
            <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900">分</span>
          </div>
        </label>
      )}
      <div className="space-y-2">
        {blocks.map(block => (
          <DslBlockRow
            key={block.id}
            block={block}
            executionMode={template.executionMode}
            disabled={disabled}
            root={root}
            onRootChange={nextRoot => onChange({ ...template, root: nextRoot })}
          />
        ))}
      </div>
      <div className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-3 text-xs leading-6 text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/25 dark:text-cyan-100">
        <span className="font-semibold">当前日线规则：</span>
        {summarizeDailyDslGroup(root)}
      </div>
    </div>
  )
}
