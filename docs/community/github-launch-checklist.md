# GitHub 发版配置清单

本清单供仓库维护者在**每次发版**与**仓库设置变更**时执行，不再是首发专用：第 2–5 节为仓库设置（完成后按需复查），第 1、6–7 节为每次发版都要走的流程，第 8 节为长期约束记录。所有页面文案、截图和 Release 说明必须只描述公开仓库真实拥有的能力。

## 1. 推送前自检（每次发版）

- [ ] 推送本批变更前（或推送后立即）完成第 3 节 Discussions 开启（含 Q&A / Ideas 分类）与第 4 节 Private vulnerability reporting 开启——否则 `.github/ISSUE_TEMPLATE/config.yml` 的三个反馈引导入口会 404。
- [ ] 确认 `./.github/scripts/Test-PublicBoundary.ps1` 通过。
- [ ] 确认 `pnpm run verify` 通过。
- [ ] Review 待提交文件，确认没有数据库、日志、凭据、持仓、本机路径和构建产物。
- [ ] 发版说明从 [`docs/releases/TEMPLATE.md`](../releases/TEMPLATE.md) 复制为 `docs/releases/v<version>.md`，全部占位符已替换，内容与代码真实能力一致（`.github/workflows/release.yml` 会强制校验该文件存在）。
- [ ] README「下载与安装」章节已同步：版本号、安装包文件名、下载链接与新版一致（README 顶部徽章为动态徽章，无需手改）。

## 2. 平台配置：About 与 Topics

在仓库主页 **About -> Settings** 中：

- [ ] About 描述建议使用一句话定位：**本地优先的 A 股个人投研工作台：把资讯、行情、产业研究与策略信号沉淀为可追踪、可复盘、可验证的研究闭环**。
- [ ] 添加以下 12 个 Topics：

```text
a-share
china-stock-market
investment-research
financial-research
local-first
electron
typescript
sqlite
ai-agent
deep-research
portfolio-analysis
backtesting
```

不要添加 `trading-bot`、`stock-prediction` 或 `auto-trading`，避免吸引与产品边界不符的用户。

## 3. 平台配置：Discussions

- [ ] 在 **Settings -> General -> Features** 开启 Discussions。
- [ ] 只保留或创建 `Announcements`、`Q&A`、`Ideas`、`Show and tell` 四个分类。
- [ ] `Announcements` 设置为仅维护者可创建。
- [ ] 根据 [`docs/community/discussion-launch.md`](discussion-launch.md) 发布三篇内容（首发；后续版本只发布新的使用反馈集中帖）。
- [ ] 置顶《欢迎来到 RT-ResearchFlow》《社区版能力与项目边界》与**当前版本**的使用反馈集中帖（示例：首发为《v0.1.0-beta.1 使用反馈集中帖》）。
- [ ] 验证 Issue 模板中的 Q&A 与 Ideas 链接能够打开对应分类。

## 4. 平台配置：安全设置

在 **Settings -> Security** 或 **Security -> Security advisories** 中确认：

- [ ] Private vulnerability reporting 已开启，外部用户可以看到 **Report a vulnerability**。
- [ ] Secret scanning 已开启。
- [ ] Push protection 已开启。
- [ ] Dependency graph 和 Dependabot alerts 已开启。
- [ ] `SECURITY.md` 中的私密报告路径实际可用。

不要要求报告者通过公开 Issue 提交漏洞、凭据样本或数据库。

## 5. 平台配置：main 规则集与 FUNDING

在 **Settings -> Rules -> Rulesets** 维护轻量规则集 `main-protection`：

- [ ] 目标分支为默认分支 `main`，规则集状态为 Active。
- [ ] 阻止分支删除和 force push。
- [ ] 要求状态检查 `Verify / verify` 成功。
- [ ] 不允许通过关闭检查、改名工作流或管理员随意绕过来发布失败代码。
- [ ] 当前个人维护阶段不强制多名审批者；引入稳定协作者后再增加 Pull Request 审批要求。

如果 GitHub 尚未列出 `Verify / verify`，先让 `main` 或测试 Pull Request 成功运行一次 Verify 工作流，再回来配置规则集。

FUNDING 约束：

- [ ] `FUNDING.yml` 是否启用由维护者自行决定。注意：README「赞赏」区已指向**原作者**（上游项目），不建议在本轮擅自开启本仓库的赞助入口；若日后启用，先明确归属表述再配置。

## 6. Draft Prerelease（每次发版）

仓库侧配置和线上设置确认后创建并推送标签（示例：首发为 `v0.1.0-beta.1`，后续按实际版本替换，当前仅支持 `-beta.N` 格式）：

```powershell
git tag v<version>
git push origin v<version>
```

`Release` 工作流应依次完成版本校验、公开边界、完整 Verify、Windows x64 打包、SHA256、真实解包应用冒烟测试，并创建 Draft Prerelease。检查：

- [ ] 工作流没有使用真实 AI、Tushare 或搜索凭据。
- [ ] Draft 中只有 `RT-ResearchFlow-Setup-<version>-x64.exe` 和 `SHA256SUMS.txt`（示例：首发为 `RT-ResearchFlow-Setup-0.1.0-beta.1-x64.exe`）。
- [ ] Release 标记为 Draft 和 Prerelease，没有自动公开。
- [ ] Release notes 与 `docs/releases/v<version>.md` 一致（示例：首发对照 `docs/releases/v0.1.0-beta.1.md`）。

## 7. 干净机与公开（每次发版）

- [ ] 下载 Draft 产物，不使用本地 `release` 目录中的副本。
- [ ] 完整执行 `docs/releases/windows-clean-machine-checklist.md`。
- [ ] 将测试机器、安装包 SHA256、时间、结果和失败 Issue 记录到 Release 验收记录。
- [ ] 所有阻断项清零后手动发布 Prerelease。
- [ ] 从未登录 GitHub 的浏览器复查"发现 -> 理解 -> 下载 -> 反馈"路径。
- [ ] 按 `docs/community/discussion-launch.md` 文章三模板发布本版使用反馈集中帖，并取消上一版集中帖置顶、在旧帖顶部链接到新帖。

发版完成标准不是 Star 数量，而是陌生用户能够理解项目边界、下载可信安装包、完成零 Key 首次体验，并找到正确的反馈入口。

## 8. 约束记录

- `.github/workflows/release.yml` 的版本正则目前只认 `\d+\.\d+\.\d+-beta\.\d+`（即 `-beta.N` 格式）；未来发稳定版（无 `-beta.N` 后缀）需先放宽该正则再打标签，否则发版工作流会直接失败（本轮不改工作流）。
- 发版说明固定从 `docs/releases/TEMPLATE.md` 复制，不引入根目录 CHANGELOG。
