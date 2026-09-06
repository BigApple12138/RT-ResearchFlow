# 消息中心跨会话持久化 Implementation Plan

> 对照 [`../specs/2026-08-30-message-center-persistence-design.md`](../specs/2026-08-30-message-center-persistence-design.md)

**状态：** 已完成

## Tasks

- [x] Migration 158 + repository + 单测
- [x] IPC / preload
- [x] App 合并实时+持久；append / dismiss
- [x] README 检核

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| 跨会话可见 | ✅ | list + App 启动加载 |
| dismiss | ✅ | IPC + 抽屉「忽略」 |
| fingerprint 幂等 | ✅ | repository 单测 |
| 实时不落库 | ✅ | 仅终态 append |
| 单测 | ✅ | repository + merge |
