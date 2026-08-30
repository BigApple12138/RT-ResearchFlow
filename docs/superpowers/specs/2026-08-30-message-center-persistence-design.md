# 消息中心跨会话持久化设计（D1）

**状态：** 已完成（2026-08-30）  
**日期：** 2026-08-30  
**挂靠：** [`2026-08-30-gap-closure-program-design.md`](./2026-08-30-gap-closure-program-design.md)  
**Plan：** [`../plans/2026-08-30-message-center-persistence.md`](../plans/2026-08-30-message-center-persistence.md)

## 1. 问题

FR-221 消息中心首版仅由 App 前端状态派生，进程退出后历史消失；README 已写明跨会话须另开 Migration。

## 2. 目标

1. Migration **158**：表 `message_center_events` 存可跨会话的消息事件。  
2. 窄 IPC：`list` / `append` / `dismiss`（可选 `markRead`）。  
3. 启动加载最近 N 条未 dismiss 事件；与现有**实时派生**消息合并展示（实时优先，同 fingerprint 不重复）。  
4. 抽屉支持「忽略」→ dismiss，再次启动不再出现。  
5. 单测覆盖 repository；不引入交易/荐股。

## 3. 非目标

- 不把所有实时态（扫描进行中）落库。  
- 不做推送/系统通知。  
- 不改左侧入口位置。

## 4. 数据模型

```sql
CREATE TABLE message_center_events (
  id            TEXT PRIMARY KEY,           -- uuid
  fingerprint   TEXT NOT NULL UNIQUE,       -- 去重键，如 scan-last:20260830
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  source        TEXT NOT NULL,
  tone          TEXT NOT NULL CHECK (tone IN ('info','success','warning','danger')),
  action_kind   TEXT,                       -- feed | decision-center | onboarding | null
  created_at    INTEGER NOT NULL,
  dismissed_at  INTEGER
);
CREATE INDEX idx_message_center_events_created ON message_center_events(created_at DESC);
```

## 5. 写入时机（首批）

| 事件 | fingerprint | 谁写 |
|---|---|---|
| 资讯扫描完成（非进行中） | `scan-last:{publishedDateBJ or ymd}` | Renderer 在 `scanStatus.lastScanAt` 变化时 `append`（幂等） |
| 初始化失败 | `initialization-error:{hash(error)}` | Renderer 在 `initializationFlow.error` 出现时 |
| 启动补漏完成/失败文案 | `catch-up:{hash(message)}` | Renderer 在 catchUpMessage 稳定含完成/失败时 |

实时「扫描中 / 初始化中 / 未读计数」仍只派生、不落库。

## 6. UI

- `MessageCenterItem` 增加可选 `persistedId` / `dismissible`。  
- 持久项显示「忽略」；调用 `dismiss`。  
- `action_kind` 映射到既有 tab / onboarding，**不**序列化函数。

## 7. 验收

1. 写入扫描完成事件 → 重启应用仍可见（未 dismiss）。  
2. dismiss 后重启不可见。  
3. 同 fingerprint 重复 append 不增行。  
4. MessageCenter README / FR 更新。  
5. repository 单测绿。
