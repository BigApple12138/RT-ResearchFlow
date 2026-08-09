# FilterBar 组件维护说明

## 模块功能

`FilterBar` 是资讯情报台中部队列的工具区, 负责相关性口径（与我相关 / 全部）、影响力分段筛选、标题/摘要搜索，以及扫描状态与未读数量。手动扫描主入口由资讯页顶部状态区承载, 本组件只保留队列控制。

## 实现思路

组件直接从 `useAppStore` 读取资讯筛选条件与扫描状态, 不持有本地业务状态。默认 `relevanceScope='portfolio'`（本地持仓词表过滤，0 Token）；`data-testid`：`briefing-relevance-portfolio` / `briefing-relevance-all`。影响力筛选与搜索仍叠加在当前相关性口径上。未读数绑定当前口径；相关模式下若全部未读更大，以次级文案展示「全部未读 N」。无持仓回退时提示「暂显示全部」。

## 主要 props/state/事件流

- `relevanceScope`: `portfolio` | `all`，切换后 `setFilter` 触发 `loadBriefings`。
- `selectedRating`: 当前影响力筛选, 可为全部、重大、重要或一般。
- `searchQuery`: 标题与摘要搜索关键词。
- `scanStatus`: 最近扫描状态, 用于展示上次扫描时间。
- `isScanning`: 扫描执行中状态, 控制工具条状态文案。
- `unreadCount` / `allUnreadCount` / `relevanceModeApplied`: 未读与回退提示。

## 特殊逻辑备忘

扫描能力沿用全局 store 既有动作, 主按钮放在资讯页顶部状态区。本组件不直接访问 IPC。工具条应保持紧凑, 控件采用轻量白底胶囊样式, 不在此处增加来源树、日期树、详情动作或第二个“立即扫描”按钮。