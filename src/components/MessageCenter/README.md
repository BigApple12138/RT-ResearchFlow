# MessageCenter 组件说明

## 模块功能

`MessageCenter` 承载 FR-221 的全局消息中心。它不是新的业务工作台, 而是把资讯扫描、初始化、数据源、AI、条件积木、回测和今日看板高优先级提醒等“需要知道”的消息收敛到左侧栏底部的独立入口中。

## 实现思路

实时态（扫描中、未读计数等）仍由 App 基于前端状态派生。跨会话历史经 Migration 158 表 `message_center_events` 持久化：`messageCenter:list/append/dismiss`；扫描完成 / 初始化失败 / 补漏终态由 Renderer 幂等 append。抽屉合并实时+持久（同主题去重），持久项可「忽略」。

## 主要 props/state/事件流

- `MessageCenterDrawer.open`: 控制抽屉是否显示。
- `MessageCenterDrawer.messages`: 当前消息列表。
- `MessageCenterDrawer.onClose`: 关闭抽屉。
- `MessageCenterDrawer.onDismiss`: 忽略持久消息。
- `MessageCenterItem.onAction`: 可选跳转动作, 由 App 注入, 通常切换到资讯、今日看板或打开初始化引导。
- `persistedId` / `fingerprint`: 持久化事件标识。

## 特殊逻辑备忘

- 消息中心入口位于左侧栏配置中心上方, 与配置中心同属全局辅助入口。
- 今日看板高优先级信号只在消息中心提示, 具体研判仍回到今日看板完成。
- 跨会话消息历史见 `messageCenterEventRepository` 与 FR D1（2026-08-30）。