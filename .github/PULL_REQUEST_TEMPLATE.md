## 变更说明

请说明要解决的问题、用户可见变化和明确不在本次范围内的内容。

## 验证

- [ ] `pnpm run verify`
- [ ] `./.github/scripts/Test-PublicBoundary.ps1`
- [ ] 涉及界面时，已验证默认窗口、最大化、亮暗主题和键盘操作
- [ ] 涉及数据库时，已覆盖 Migration、旧数据升级与失败回滚
- [ ] 涉及联网或 AI 时，已覆盖零 Key、超时、限流、取消和敏感信息边界

## 发布边界

- [ ] 未提交 API Key、Token、数据库、日志、真实持仓或本机绝对路径
- [ ] 未引入荐股、收益承诺、自动交易或绕过用户授权的联网行为
- [ ] 文档和截图只描述当前公开仓库真实可用的能力

## 关联信息（必填）

- 关联 Issue / Discussion 链接：
- SDD：spec/plan 归档路径（如 `docs/superpowers/specs/…` 与 `docs/superpowers/plans/…`；豁免时请注明理由，豁免名单见 `AGENTS.md`）：
- 提交说明使用中文：Conventional Commits 前缀（如 `feat(trend):` / `fix:` / `docs:`）+ 中文正文，写清「为什么」：
  - [ ] 已确认

> 提醒：合入 `develop` / `main` 前，必须完成一次可核查的 Review（Approve 或带结论的 Review Comment），阻塞项处理完毕后方可合并。

