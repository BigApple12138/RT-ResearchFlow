/** 讨论压缩检查点列表视图模型（IPC 已按 covered 降序；首条=最新可恢复）。 */

export type CompactionCheckpointItem = {
  id: string
  sourceStartSequence: number
  coveredThroughSequence: number
  summary: string
  tokensBefore?: number | null
  tokensAfter?: number | null
  createdAt: number
  isLatest: boolean
  canRestore: boolean
}

export function buildCompactionCheckpointListModel(
  checkpoints: Array<{
    id: string
    sourceStartSequence: number
    coveredThroughSequence: number
    summary: string
    tokensBefore?: number | null
    tokensAfter?: number | null
    createdAt: number
  }>,
): CompactionCheckpointItem[] {
  return checkpoints.map((item, index) => ({
    ...item,
    isLatest: index === 0,
    canRestore: index === 0,
  }))
}
