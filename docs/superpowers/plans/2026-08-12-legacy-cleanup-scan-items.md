# 遗留清理（扫描 1–4）Implementation Plan

> **For agentic workers:** 按任务执行；每项改完做 redundancy 自审。

**Goal:** 收尾扫描列出的文档/E2E/空壳/文案四处，不删有意遗留工作台。

**Architecture:** 纯 Renderer/文档/E2E 对齐既有批准 spec。

**Tech Stack:** 现有测试与 React。

**Spec：** [`../specs/2026-08-12-legacy-cleanup-scan-items-design.md`](../specs/2026-08-12-legacy-cleanup-scan-items-design.md)

**状态：** 已完成  

## Tasks

### Task 1: E2E research-access → Agent 页 — [x]
### Task 2: IndustryResearch README — [x]
### Task 3: App 后台任务条文案 — [x]
### Task 4: 去掉空壳 deep-research-sources + 契约测 — [x]

## 设计初衷检核

| Spec 项 | 结果 | 说明 |
|---|---|---|
| A E2E Agent 页 | 符合 | `config-tab-agent` |
| B README | 符合 | 程序化挂载表述 |
| C 任务条文案 | 符合 | aria「打开产业研究工作台」 |
| D 空壳 sources | 符合 | 已删；证据走 Detail Tab |
| E 不删遗留工作台 | 符合 | 未删 Workbench / IndustryResearch |
