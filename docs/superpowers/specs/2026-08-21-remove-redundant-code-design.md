# 冗余代码清理设计

**状态：** 已批准执行（2026-08-21；用户 `/goal`：review 后有冗余直接处理至最优）  
**日期：** 2026-08-21  
**依据：** 同会话冗余审查结论（已核实死路径 / 近重复）  
**Plan：** [`../plans/2026-08-21-remove-redundant-code.md`](../plans/2026-08-21-remove-redundant-code.md)

## 1. 目标

删除已核实无人使用的死代码与空壳，收敛近重复搜索 API，去掉无用 DI 槽；对已废弃 `sector_flow_daily` 表做向前 Migration 删除，避免空表残留。

## 2. 范围

| 项 | 动作 |
|---|---|
| `sectorFlowDailyRepository.ts` | 删除文件 |
| 表 `sector_flow_daily` | Migration **157** `DROP TABLE`（幂等） |
| `ensureSectorFlowBackfill` | 删除空实现 |
| `isPublicStockUniverseSyncRunning` / `isPublicHistoricalDailySyncRunning` | 删除无调用导出 |
| `persistRemote?` | 从价史 loader 依赖中移除 |
| `searchStockBasicByKeyword` | 改为委托 `searchByNameOrCode(..., 20)`，trend 与 AI 共用一套匹配逻辑 |
| `upsertAll` | **保留**（集成测试造数；生产不用不算死文件） |

## 3. 非目标

- 不合并 Tushare / 公共日线双路径（职责不同）
- 不改板块资金观察存档语义（FR-274）
- 不抽公共 `mapWithConcurrency` 到共享 util（收益低）

## 4. 验收

1. 全仓无对已删符号的引用  
2. Migration 157 可在新库/升级库执行  
3. 相关单测（价史、公共身份、trend 搜索若有、industry 集成）绿  
4. PR Review 后合入 develop  

## 5. 修订记录

- 2026-08-21：按审查结论与用户「直接改到最优」开写并执行。
