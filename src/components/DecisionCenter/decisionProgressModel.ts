import type { DecisionSignalItem } from './SignalCard'

export interface DecisionProgressModel {
  total: number
  pending: number
  read: number
  watching: number
  dismissed: number
  resolved: number
  title: string
  description: string
}

export function buildDecisionProgressModel(signals: DecisionSignalItem[]): DecisionProgressModel {
  const total = signals.length
  const read = signals.filter(signal => signal.status === 'READ').length
  const watching = signals.filter(signal => signal.status === 'WATCHING').length
  const dismissed = signals.filter(signal => signal.status === 'DISMISSED').length
  const resolved = signals.filter(signal => !!signal.resolvedAt || !!signal.resolution).length
  // 待处理 = 未读 NEW；关注中单独统计，不再计入待处理
  const pending = signals.filter(signal => signal.status === 'NEW' && !signal.resolvedAt).length

  if (total === 0) {
    return {
      total,
      pending,
      read,
      watching,
      dismissed,
      resolved,
      title: '今日暂无信号',
      description: '当前筛选条件下没有需要展示的信号。',
    }
  }

  if (pending === 0) {
    return {
      total,
      pending,
      read,
      watching,
      dismissed,
      resolved,
      title: '待处理已清空',
      description: '未读已清空。关注项在「关注中」查看。',
    }
  }

  return {
    total,
    pending,
    read,
    watching,
    dismissed,
    resolved,
    title: `还有 ${pending} 条待处理`,
    description: '「处理完 / 忽略 / 关注」都会移出待处理。',
  }
}