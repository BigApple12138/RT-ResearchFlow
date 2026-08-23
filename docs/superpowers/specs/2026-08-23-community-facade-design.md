# 社区门面（Community Facade）设计

**状态：** 已完成（2026-08-23 开写；批次一至批次三实施并收尾）  
**日期：** 2026-08-23  
**依据：** 社区门面审查结论（反馈渠道、README 事实、CI 徽章与 `.github` 配置）  
**Plan：** [`../plans/2026-08-23-community-facade.md`](../plans/2026-08-23-community-facade.md)

## 1. 问题清单（已核实）

本仓库为 `BigApple12138/RT-ResearchFlow`（fork），上游为 `caoritian002-wq/RT-ResearchFlow`。以下问题均已逐条核实：

| # | 问题 | 现状 |
|---|---|---|
| 1 | `config.yml` 导流上游 | `.github/ISSUE_TEMPLATE/config.yml` 三个 `contact_links` 全部指向上游仓库的 Discussions / Security |
| 2 | README「八个一级工作台」失实 | 主导航实为 7 个一级入口（`src/App.tsx` `NAV_TABS`：今日看板、股票走势图、长线趋势、大盘云图、短线策略、资讯、AI 分析）；配置中心是底部按钮打开的抽屉，消息中心是标题栏通知入口 |
| 3 | 数据源清单缺腾讯 | README 写「东方财富 / 新浪等公开接口」，与 `docs/releases/v0.1.0-beta.5.md` 第 23 行「东方财富、新浪、腾讯」不一致 |
| 4 | 缺反馈渠道链接 | README「贡献」节只有一句空泛表述，没有 Issues / Discussions / Security 的具体入口 |
| 5 | 缺已知限制章节 | 限制清单只存在于 Release 说明（`docs/releases/v0.1.0-beta.5.md` 第 60–67 行），README 未搬运 |
| 6 | 徽章无 CI / 硬编码版本 | 徽章区第 6 行为硬编码 `version-0.1.0-beta.5` 静态徽章；无 CI 状态、License、下载量等动态徽章 |
| 7 | `.github` 缺 dependabot / stale / labels | 无依赖升级自动化、无过期 Issue/PR 清理、无标签元数据参照 |
| 8 | `package.json` 缺元数据 | 无 `repository` / `homepage` / `bugs` 字段 |
| 9 | 社区文档链接指向上游 | README 反馈入口缺失导致用户默认被 `config.yml` 导流上游（与 #1 同源） |

## 2. 目标

1. **反馈渠道回到本仓库**：Issue 模板 `contact_links`、README「反馈与支持」章节、PR 模板全部指向 `BigApple12138/RT-ResearchFlow`。
2. **README 事实与产品一致**：工作台数量表述不写死、数据源补齐腾讯、补「已知限制」与「反馈与支持」章节。
3. **徽章动态化**：删除硬编码版本徽章，改用 Release / License / Verify CI / 下载量动态徽章。
4. **`.github` 基建补齐**：dependabot、stale workflow、labels 元数据、PR 模板三项补充。
5. **`package.json` 元数据补齐**（仅新增字段）。

## 3. 非目标

- **不动业务代码**：`src/`、`electron/`、`tests/` 与依赖、lockfile 一律不改（`package.json` 仅新增元数据字段）。
- 不引入 CHANGELOG 工具、文档站、release-please 等重型发布链。
- 不改 README 中上游署名与赞赏归属（约第 24、481–487 行）；只修反馈渠道类链接。
- 不自动建标签 / 不改受保护分支规则；`labels.yml` 仅作维护者参照。

## 4. 实施步骤（三批次）

### 批次一：SDD 落档 + 事实修正

- 新增本 spec 与对应 plan。
- `config.yml` 三个 `contact_links` 的 URL 改为本仓库。
- README：工作台数量表述改为不写死数量；「配置中心」行标注抽屉入口；数据源补腾讯。
- README 新增「已知限制」（逐条搬运 v0.1.0-beta.5 第 60–67 行）与「反馈与支持」章节；锚点导航追加两个链接；「贡献」节改写为具体链接。

### 批次二：徽章与 `.github` 基建

- README 徽章区：删硬编码 version 徽章，新增 Release / License / Verify CI / 下载量动态徽章，保留 5 个技术栈静态徽章。
- `PULL_REQUEST_TEMPLATE.md`：追加「关联 Issue / Discussion」「SDD 归档路径或豁免理由」「中文提交说明」三项与 Review 提醒。
- `package.json`：新增 `repository` / `homepage` / `bugs`。
- 新增 `.github/dependabot.yml`（npm + github-actions，weekly；ignore `electron` 与 `better-sqlite3`，原生模块须按 Electron ABI 人工评估）。
- 新增 `.github/labels.yml`（类型 / 状态 / 领域三类标签元数据）与 `.github/workflows/stale.yml`（actions/stale@v9，60 天 stale、14 天关闭，中文留言）。

### 批次三：发版标准化与社区文档收尾（概要）

- 新增 `docs/releases/TEMPLATE.md`：提炼五份 beta 发版说明的公共骨架（标题 → 免责引言 → 下载与校验 → 本版本更新三段式〔上游合入 / 本 fork 独有 / 工程质量〕→ 安装升级卸载 → AI 与数据源 → 已知限制 → 反馈），每节带填写指引占位；不引入 CHANGELOG。
- 修订 `docs/community/github-launch-checklist.md`：首发语境通用化为「每次发版 + 仓库设置」复选表；补发版说明从模板复制、README 下载章节同步检查项；新增平台配置清单（About / Topics / Discussions 四分区 / Private vulnerability reporting / main 规则集 / FUNDING）；附录记录 release.yml 版本正则仅认 `-beta.N` 的约束。
- 修订 `docs/community/discussion-launch.md`：全部上游反馈渠道链接改为本仓库；反馈集中帖改为「每版复制此模板并更新版本号」通用形式；文首声明本 fork 社区以 `BigApple12138/RT-ResearchFlow` 为准。
- 修订 `CODE_OF_CONDUCT.md`：私密报告联系方式改为具体可核查路径（维护者 GitHub 主页或仓库 Security 私密漏洞报告）。
- README：新增「路线图」小节（由 beta.5 已知限制反推的方向性计划，不承诺时间），并在顶部锚点导航追加「路线图」链接。
- 收尾：本 spec 批次三小节与实施对齐；plan 三批次任务勾选完成并回填「设计初衷检核」，两文 `状态` 改为已完成。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| GitHub 中文锚点规则变化导致导航失效 | 锚点按 GitHub 中文标题惯例生成并人工核对标题文字 |
| dependabot 自动升级破坏原生模块 | `electron` 与 `better-sqlite3` 显式 ignore，注释说明 ABI 原因 |
| stale bot 误伤长期有效议题 | 豁免 `good first issue` / `help wanted` / `security` 标签；留言说明可回复重开 |
| 动态徽章依赖 shields.io 可用性 | 仅装饰性展示，不影响文档语义 |
| `labels.yml` 不被 GitHub 原生识别 | 文件内注明为「手动建标签参照」元数据，不声称自动生效 |

## 6. 验收

1. `config.yml` 与 README 中反馈类链接全部指向 `BigApple12138/RT-ResearchFlow`。
2. README 不再出现「八个一级工作台」与「东方财富 / 新浪等」旧表述；「已知限制」「反馈与支持」章节齐备且锚点可达。
3. 徽章区无硬编码版本，4 个动态徽章 + 5 个技术栈徽章齐备。
4. `.github/` 新增 3 个文件、PR 模板追加三项；`package.json` 仅新增 3 个元数据字段。
5. 工作区无密钥模式（`sk-` / `ghp_` 等）与个人绝对路径残留。
