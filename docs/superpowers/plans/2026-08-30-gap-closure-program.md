# 产品缺口闭环总控 Implementation Plan

> 对照 [`../specs/2026-08-30-gap-closure-program-design.md`](../specs/2026-08-30-gap-closure-program-design.md)

**状态：** 已完成  
**Goal：** 按 SDD 将 §4 全部缺口闭环（实现+测试+检核，或用户书面结案不做）

## 波次勾选

- [x] **Wave 0** 总控 design/plan 用户批准（默认范围：选项 1；G1/发布侧可结案）
- [x] **Wave 1** Track A：自动化验收闭环 + 文档回填（活体 MCP 环境可选）
- [x] **Wave 2** Track B：B1 资讯+观察池 → B2 partial 重试
- [x] **Wave 3** Track C：C1 竞价价史冷启动性能
- [x] **Wave 4** Track D：D1 消息中心跨会话持久化
- [x] **Wave 5** Track E：E1 产业意图可启 → E2 持仓资讯 AI 摘要
- [x] **Wave 6** Track F：F1 日线 DSL → F2 两阶段组合（单测 + E2E）
- [x] **Wave 7** Track G：G1 云端分钟 **书面结案不做**；发布侧 macOS/签名 **书面结案排除**
- [x] **收尾** README 已知限制/路线图同步；总控检核表；陈旧 SDD 状态修正

## 设计初衷检核（程序完成后填）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| §2 目标 1–4 | ✅ | 各缺口有 spec/plan；可测项有单测/E2E；A 已回填；边界遵守 |
| §4 全清单闭环 | ✅ | B–F 实现；G/发布侧书面结案；A 自动化闭环 |
| §3 非目标未越界 | ✅ | 无交易/无 Wave2 拒绝项 |
| §8 程序级验收 | ✅ | 相关单测绿；F2 E2E 绿；检核已填 |
