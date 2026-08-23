# 社区门面（Community Facade）Implementation Plan

> 对照 [`../specs/2026-08-23-community-facade-design.md`](../specs/2026-08-23-community-facade-design.md)

**状态：** 已完成  
**范围：** 仅文档与 `.github` 配置 + `package.json` 元数据；不动 `src/`、`electron/`、`tests/`、依赖与 lockfile

## Tasks

### 批次一：SDD 落档 + 事实修正（已完成）

- [x] 新增本 spec/plan 两份归档文件
- [x] `.github/ISSUE_TEMPLATE/config.yml`：三个 `contact_links` URL 由上游改为本仓库
- [x] README：工作台数量表述改为不写死数量；「配置中心」行标注抽屉入口
- [x] README：数据源行补腾讯（东方财富 / 新浪 / 腾讯）
- [x] README：新增「已知限制」章节（搬运 `docs/releases/v0.1.0-beta.5.md` 第 60–67 行）
- [x] README：新增「反馈与支持」章节（Issues / Discussions Q&A / Discussions Ideas / Security 私密报告），并改写「贡献」节
- [x] README：锚点导航追加「已知限制」「反馈」两个链接

### 批次二：徽章与 `.github` 基建（已完成）

- [x] README 徽章区：删硬编码 version 徽章，新增 Release / License / Verify CI / 下载量动态徽章（alt 补齐），保留 5 个技术栈静态徽章
- [x] `.github/PULL_REQUEST_TEMPLATE.md`：追加关联 Issue / SDD 归档路径 / 中文提交说明三项 + Review 提醒
- [x] `package.json`：新增 `repository` / `homepage` / `bugs`（name/version 之后）
- [x] 新增 `.github/dependabot.yml`（npm + github-actions，weekly，limit 5；ignore `electron` / `better-sqlite3`）
- [x] 新增 `.github/labels.yml`（类型 / 状态 / 领域标签元数据，含 name/description/color）
- [x] 新增 `.github/workflows/stale.yml`（actions/stale@v9，60/14，中文留言，豁免标签）

### 批次三：发版标准化与社区文档收尾（已完成）

- [x] 新增 `docs/releases/TEMPLATE.md`（五份 beta 公共骨架 + 三段式「本版本更新」+ 填写指引占位；不引入 CHANGELOG）
- [x] `docs/community/github-launch-checklist.md`：通用化为「每次发版 + 仓库设置」复选表；补模板复制与 README 同步检查项；合并平台配置清单（About / Topics / Discussions / 安全 / main 规则集 / FUNDING）；新增 release.yml `-beta.N` 正则约束记录
- [x] `docs/community/discussion-launch.md`：上游反馈渠道链接全部改为 `BigApple12138/RT-ResearchFlow`；反馈集中帖改为每版复制模板形式；文首加本 fork 社区归属声明
- [x] `CODE_OF_CONDUCT.md`：私密报告指引改为具体可核查路径（维护者 GitHub 主页或仓库 Security 私密漏洞报告）
- [x] README：新增「路线图」小节，顶部锚点导航追加「路线图」链接（锚点与标题一致）
- [x] spec 批次三小节改写为与实际实施一致；回填下方「设计初衷检核」，更新 spec/plan 文首 `状态`
- [x] 自检：grep 确认残留 `caoritian002-wq` 仅剩上游署名 / 赞赏归属 / 增量对照语境；README 锚点与标题匹配

## 设计初衷检核（批次三完成后填）

| Spec 项 | 结果 | 说明 |
|---|---|---|
| §2 目标 1：反馈渠道回到本仓库 | ✅ 已解决 | `.github/ISSUE_TEMPLATE/config.yml` 三个 `contact_links` 均指向本仓库；README「反馈与支持」四渠道齐备；`docs/community/discussion-launch.md` 全部链接已改本仓库；证据：`CODE_OF_CONDUCT.md` 给出可核查私密报告路径 |
| §2 目标 2：README 事实一致 | ✅ 已解决 | 「工作台一览」不再写死数量并标注抽屉/通知入口；数据源表含腾讯；「已知限制」「反馈与支持」章节齐备；证据：`README.md` |
| §2 目标 3：徽章动态化 | ✅ 已解决 | 徽章区为 4 个动态徽章（Release / License / Verify CI / 下载量）+ 5 个技术栈静态徽章，无硬编码版本；证据：`README.md` 顶部徽章区 |
| §2 目标 4：`.github` 基建 | ✅ 已解决 | `dependabot.yml`、`labels.yml`、`workflows/stale.yml` 已存在；`PULL_REQUEST_TEMPLATE.md` 含关联 Issue / SDD 归档 / 中文说明与 Review 提醒；证据：`.github/` 目录 |
| §2 目标 5：`package.json` 元数据 | ✅ 已解决 | `repository` / `homepage` / `bugs` 已新增且指向本仓库；证据：`package.json` 第 4–9 行 |
| §6 验收 1–5 | ✅ 已解决 | 1）反馈类链接全部指向本仓库（grep 复核）；2）README 无旧表述，锚点可达；3）徽章无硬编码；4）`.github` 新增文件与 PR 模板、元数据齐备；5）自检未见密钥模式与个人绝对路径。残留 `caoritian002-wq` 仅限上游署名（README 二次开发说明/赞赏区）、spec 问题清单与 port 归档的增量对照语境，均属保留范围 |
| 批次三新增：发版标准化 | ✅ 已解决 | `docs/releases/TEMPLATE.md` 与 `release.yml` 校验路径（`docs/releases/v<version>.md`）对齐；`github-launch-checklist.md` 含模板复制与 README 同步检查；未引入 CHANGELOG |
| 批次三新增：路线图 | ✅ 已解决 | README「路线图」小节由 beta.5 已知限制反推，方向性表述不承诺时间；锚点 `#路线图` 与标题一致 |
