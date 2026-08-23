# Tushare 可配置 API 地址 Implementation Plan

> **For agentic workers:** 按任务勾选推进；完成后填写文末「设计初衷检核」。

**Goal:** 数据源配置支持可选 Tushare API 地址；验证与全部业务请求走同一解析 URL。  

**状态：** 已完成  
**Spec：** [`../specs/2026-08-10-tushare-custom-api-url-design.md`](../specs/2026-08-10-tushare-custom-api-url-design.md)  

**Architecture:** `data_source_config.tushareApiUrl` 可空；空=官方默认。`tushareService` 统一 `getActiveTushareApiUrl()`（可 override）；IPC/UI 读写并校验 `http(s)://`。  

**Tech Stack:** Electron main IPC、SQLite Migration、React DataSource 页、Vitest  

## Global Constraints

- 不硬编码第三方代理 IP；不把用户 Token 写入仓库  
- Renderer 不直连 Tushare  
- 老库升级后默认行为与改前一致  

## Tasks

- [x] Task 1：URL 校验/解析纯函数 + 单测（`tushareApiUrl.ts` / `tushareApiUrl.test.ts`）  
- [x] Task 2：Migration 146 + repository/types  
- [x] Task 3：tushareService 全入口改用解析 URL；validate 支持 override  
- [x] Task 4：IPC + preload  
- [x] Task 5：DataSource UI + README  
- [x] Task 6：typecheck / 相关单测；更新 spec 状态与检核表  

## 设计初衷检核（完成后填写）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| A 官方默认 | 符合 | 空地址 → `DEFAULT_TUSHARE_API_URL`；单测覆盖 |
| B 自定义地址持久化 | 符合 | `tushareApiUrl` 列 + get/save/validate IPC；业务走 `getActiveTushareApiUrl()` |
| C 非法协议拒绝 | 符合 | `validateTushareApiUrlInput`；IPC 验证/保存拒绝；单测覆盖 |
| D 清空恢复默认 | 符合 | 空串存 `null`，解析回官方 |
| E 老库 Migration | 符合 | version 146 `ALTER TABLE ... ADD COLUMN` |

**总评：** 符合设计。  
**检核人 / 日期：** Agent / 2026-08-10  
