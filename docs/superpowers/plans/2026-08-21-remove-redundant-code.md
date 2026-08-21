# 冗余代码清理 Implementation Plan

> 对照 [`../specs/2026-08-21-remove-redundant-code-design.md`](../specs/2026-08-21-remove-redundant-code-design.md)

**状态：** 已合入 develop（PR #12 → `93a315b`）  
**分支：** `chore/remove-redundant-code`（已删）

## Tasks

- [x] Migration 157 + 删 `sectorFlowDailyRepository` + 清类型引用
- [x] 删空壳 / 无用导出 / `persistRemote`
- [x] `searchStockBasicByKeyword` 委托 `searchByNameOrCode`
- [x] 单测 + PR Review 合入

## 设计初衷检核（完成后填）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| §2 死代码删除 | ✅ | 仓库文件删除；Migration 157 DROP 表；空壳/无用导出已去 |
| §2 搜索收敛 | ✅ | keyword 搜索委托 searchByNameOrCode(limit=20) |
| §4 验收 | ✅ | 相关单测 18 绿；PR #12 Review 后合入 `93a315b` |
