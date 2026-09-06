# 相对持仓总结今日资讯（E2）Implementation Plan

> 对照 [`../specs/2026-08-30-portfolio-news-digest-design.md`](../specs/2026-08-30-portfolio-news-digest-design.md)

**状态：** 已完成

## Tasks

- [x] `PortfolioBriefMode` + `newsDigest` 主进程路径（今日 BJ + portfolio relevance ≤20）
- [x] IPC / preload 类型扩展
- [x] AI 分析 quick chip `chip-portfolio-news-digest`
- [x] 空态纯函数 + service 单测（无资讯不调 AI；有资讯调 AI）
- [x] README

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| mode newsDigest | ✅ | service + IPC + preload |
| 本地过滤后 AI 摘要 | ✅ | listBriefings(date, relevance=portfolio) |
| 空持仓/无相关不调 AI | ✅ | 空列表直接返回文案 |
| 未配置返回指引 | ✅ | resolveProviderCredentials 失败路径 |
| 禁止买卖建议 | ✅ | PORTFOLIO_NEWS_DIGEST_USER_PROMPT |
| chip 触发 | ✅ | runQuickChip('newsDigest') |
| 单测 | ✅ | portfolioBrief.service.test |
