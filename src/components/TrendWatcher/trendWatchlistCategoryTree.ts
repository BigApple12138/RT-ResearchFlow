export interface WatchlistCategorySuggestion {
  category: string
  subCategory: string
}

/** 观察池分类树（与 TrendManager 下拉一致） */
export const WATCHLIST_CATEGORY_TREE: Record<string, string[]> = {
  AI算力: ['AI服务器'],
  半导体设备: ['刻蚀设备', '薄膜沉积设备', '清洗设备', '离子注入'],
  半导体材料: ['光刻胶（KrF/ArF高端）', '光刻胶（G/I线成熟）', '半导体硅片', '溅射靶材', 'CMP抛光材料', 'EDA软件', '先进封装（封测）', '测试板'],
  CPO: ['光模块', '光器件', 'CPO交换机', '封装/耦合设备'],
  PCB: ['消费电子/FPC', '通信/服务器PCB', '汽车电子PCB', 'IC封装基板', '覆铜板（CCL）', '显卡/新能源PCB'],
  锂电池: ['磷酸铁锂正极', '三元材料正极', '负极材料', '电解液', '隔膜', '结构件', '锂电设备'],
  固态电池: ['固态电池（整体）', '硫化物电解质', '氧化物电解质', '固态电池隔膜'],
  '绿色能源（风电）': ['风电整机', '风电叶片'],
  储能: ['储能系统集成商', '储能电池'],
  能源金属: ['锂矿', '钴', '镍'],
}

export function isValidWatchlistCategoryPair(category: string, subCategory: string): boolean {
  if (!category) return subCategory === ''
  const subs = WATCHLIST_CATEGORY_TREE[category]
  if (!subs) return false
  return subCategory === '' || subs.includes(subCategory)
}

export function normalizeWatchlistTsCode(tsCode: string): string {
  return tsCode.trim().toUpperCase()
}
