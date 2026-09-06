# 相对持仓总结今日资讯（E2）设计

**状态：** 已完成  
**日期：** 2026-08-30  
**挂靠：** [`2026-08-30-gap-closure-program-design.md`](./2026-08-30-gap-closure-program-design.md) §4.5 E2  
**Plan：** [`../plans/2026-08-30-portfolio-news-digest.md`](../plans/2026-08-30-portfolio-news-digest.md)

## 1. 问题

资讯「与我相关」本地过滤已落地；缺显式「相对持仓总结今日资讯」AI 摘要（用户触发、不自动烧 Token）。

## 2. 目标

1. `PortfolioBriefMode` 新增 `newsDigest`。  
2. 主进程：按今日 BJ 日 + `relevance: portfolio` 取最多 20 条资讯标题/摘要/影响级（本地），再 `callWithFallback` 生成摘要；禁止买卖建议；空持仓/无相关资讯诚实返回。  
3. AI 分析 quick chip：「相对持仓总结今日资讯」→ `runPortfolioBrief({ mode: 'newsDigest' })`。  
4. 单测：prompt/空态纯函数；service 可 mock AI。

## 3. 非目标

- 不自动定时跑。  
- 不改默认资讯过滤。  
- 不荐股。

## 4. 验收

1. 有持仓+相关资讯时 chip 产出摘要写入会话。  
2. 无持仓 / 无相关资讯不调 AI（或明确文案）。  
3. AI 未配置返回既有配置指引。
