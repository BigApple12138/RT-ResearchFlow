# 通用日线 DSL（F1）设计

**状态：** 已完成  
**日期：** 2026-08-30  
**挂靠：** [`2026-08-30-gap-closure-program-design.md`](./2026-08-30-gap-closure-program-design.md)  
**Plan：** [`../plans/2026-08-30-daily-dsl.md`](../plans/2026-08-30-daily-dsl.md)

## 1. 问题

策略实验室仅有分钟条件自由组合 + 白盒固定日线信号；无通用日线条件语言。`twoPhase` 类型可存但运行时降级为 complete，UI 已标「待实现」。不能把白盒或 SQL 预筛伪装成 DSL。

## 2. 目标

1. 新增并行模块 `electron/main/services/dailyDsl/`（**不**污染 `ConditionBlockType`）。  
2. **语法**：日线块类型 + `AND/OR/NOT` 组；启停、权重、硬门槛、严格/评分，语义对齐分钟积木。  
3. **求值**：输入升序 `DailyRow[]`（`daily_close_cache`）；缺数据 → `data_insufficient`；停用节点不计分；缺数据不作 `NOT` 反证。  
4. **证据**：每条件输出 params / actual / passed / weight / contribution / hardRequired / dataStatus / message。  
5. **首批块（可测、诚实）**：  
   - `daily_pct_chg`：最近 N 日累计涨跌幅阈值  
   - `daily_ma_cross`：收盘相对 SMA(N) 上方/下方  
   - `daily_volume_ratio`：近 1 日量 / 近 M 日均量  
   - `daily_turnover_min`：换手率下限  
6. 单测覆盖 normalize + 各块求值 + 组语义。  
7. 策略实验室：可保存 `source: 'dailyDsl'` 策略并**单独运行日线扫描**；UI 明确「日线 DSL」；`twoPhase` 仍显示待实现（属 F2）。

## 3. 非目标

- 不实现 F2 两阶段编排。  
- 不把白盒 `stockScreenerService` 整包参数化。  
- 不把日线类型混入分钟 `ConditionBlockType`。  
- 不新增外部行情请求（只用本地 cache）。  
- 不荐股、不交易。

## 4. 方案

| 方案 | 取舍 |
|---|---|
| A. 扩展 ConditionBlockType | 污染分钟校验/UI | **否决** |
| B. 并行 dailyDsl 模块 + 镜像证据契约 | 可审、可测 | **采用** |
| C. 仅文档假能力 | 违背目标 | **否决** |

## 5. 验收

1. 给定合成日线序列，四类块与 AND/OR/NOT 单测绿。  
2. 缺 close/vol → data_insufficient，NOT 不因缺数据通过。  
3. Lab 可创建/运行日线 DSL 策略并看到命中证据；两阶段仍诚实标注。  
4. README 更新：日线 DSL 可用；两阶段仍后续（F2）。
