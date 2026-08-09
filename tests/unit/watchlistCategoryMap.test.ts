import { describe, expect, it } from 'vitest'
import { mapWatchlistCategory, type WatchlistCategoryMapRule } from '../../electron/main/services/watchlistCategoryMap'

const rules: WatchlistCategoryMapRule[] = [
  {
    id: 1,
    keyword: '光模块',
    matchField: 'concept',
    category: 'CPO',
    subCategory: '光模块',
    priority: 90,
    enabled: true,
  },
  {
    id: 2,
    keyword: 'PCB',
    matchField: 'industry',
    category: 'PCB',
    subCategory: '通信/服务器PCB',
    priority: 80,
    enabled: true,
  },
  {
    id: 3,
    keyword: '算力',
    matchField: 'concept',
    category: 'AI算力',
    subCategory: 'AI服务器',
    priority: 95,
    enabled: true,
  },
  {
    id: 4,
    keyword: '铜箔',
    matchField: 'name',
    category: 'PCB',
    subCategory: '覆铜板（CCL）',
    priority: 88,
    enabled: true,
  },
  {
    id: 5,
    keyword: '锂电池',
    matchField: 'industry',
    category: '锂电池',
    subCategory: '磷酸铁锂正极',
    priority: 70,
    enabled: false,
  },
]

describe('mapWatchlistCategory', () => {
  it('按 priority 命中概念关键词', () => {
    expect(mapWatchlistCategory({
      industry: '通信设备',
      concepts: ['光模块概念', 'CPO'],
      name: '中际旭创',
    }, rules)).toEqual({
      category: 'CPO',
      subCategory: '光模块',
      matchedKeyword: '光模块',
      matchField: 'concept',
    })
  })

  it('算力优先级高于一般光模块同场时仍按最高 priority', () => {
    expect(mapWatchlistCategory({
      industry: '',
      concepts: ['算力租赁', '光模块'],
      name: '',
    }, rules)?.category).toBe('AI算力')
  })

  it('行业字段命中 PCB', () => {
    expect(mapWatchlistCategory({
      industry: '印制电路板PCB',
      concepts: [],
      name: '沪电股份',
    }, rules)).toMatchObject({
      category: 'PCB',
      subCategory: '通信/服务器PCB',
      matchedKeyword: 'PCB',
    })
  })

  it('名称命中铜箔', () => {
    expect(mapWatchlistCategory({
      industry: '有色金属',
      concepts: [],
      name: '某某铜箔股份',
    }, rules)?.subCategory).toBe('覆铜板（CCL）')
  })

  it('停用规则不命中；无规则返回 null', () => {
    expect(mapWatchlistCategory({
      industry: '锂电池',
      concepts: [],
      name: '',
    }, rules)).toBeNull()
    expect(mapWatchlistCategory({
      industry: '银行',
      concepts: [],
      name: '浦发银行',
    }, rules)).toBeNull()
  })

  it('非法主题树 pair 被跳过', () => {
    expect(mapWatchlistCategory({
      industry: '测试',
      concepts: [],
      name: '',
    }, [{
      keyword: '测试',
      matchField: 'industry',
      category: '不存在分类',
      subCategory: '也不存在',
      priority: 100,
      enabled: true,
    }])).toBeNull()
  })
})
