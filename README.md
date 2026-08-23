<h1 align="center">RT-ResearchFlow</h1>

<p align="center"><b>本地优先的 A 股个人投研工作台：把资讯、行情、产业研究与策略信号，沉淀为可追踪、可复盘、可验证的研究闭环</b></p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/BigApple12138/RT-ResearchFlow?include_prereleases" alt="Release 版本（含预发布）">
  <img src="https://img.shields.io/github/license/BigApple12138/RT-ResearchFlow" alt="开源许可证">
  <img src="https://img.shields.io/github/actions/workflow/status/BigApple12138/RT-ResearchFlow/verify.yml?branch=main&label=verify" alt="Verify CI 状态">
  <img src="https://img.shields.io/github/downloads/BigApple12138/RT-ResearchFlow/total" alt="累计下载量">
  <img src="https://img.shields.io/badge/Electron-41-47848F?logo=electron&logoColor=white" alt="Electron 41">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5">
  <img src="https://img.shields.io/badge/Node.js-20_LTS-339933?logo=nodedotjs&logoColor=white" alt="Node.js 20 LTS">
  <img src="https://img.shields.io/badge/SQLite-Local_First-003B57?logo=sqlite&logoColor=white" alt="SQLite Local First">
</p>

<p align="center">
  <a href="https://github.com/BigApple12138/RT-ResearchFlow/releases/tag/v0.1.0-beta.5"><b>下载 v0.1.0-beta.5</b></a> ·
  <a href="#它解决什么问题">解决什么问题</a> ·
  <a href="#工作台一览">工作台</a> ·
  <a href="#ai-研判与-agent-工作台">AI 与 Agent</a> ·
  <a href="#数据与零-key-路径">数据与零 Key</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#安全与隐私边界">安全边界</a> ·
  <a href="#已知限制">已知限制</a> ·
  <a href="#路线图">路线图</a> ·
  <a href="#反馈与支持">反馈</a>
</p>

> **二次开发说明：** 本仓库基于 [caoritian002-wq/RT-ResearchFlow](https://github.com/caoritian002-wq/RT-ResearchFlow) 继续演进与试验。功能、发版与文档以**本仓库**为准；若你希望跟随原作者社区节奏，请访问原项目主页。

RT-ResearchFlow 面向希望建立**自己**研究体系的 A 股个人投资者。它不是「问一次 AI 就出结论」的工具，而是把来源、事实日期、行情覆盖、反证与后续验证放在结论旁边，让判断可以保存、回访、对照结果，并在有价值时继续沉淀为产业研究增量。

| 用户关心的问题 | RT-ResearchFlow 的做法 |
|---|---|
| 一条资讯究竟影响哪些 A 股公司？ | 映射具体公司，识别持仓风险，再用近期真实行情做第二轮复核 |
| 今天的判断以后还能验证吗？ | 判断按版本保存，支持 3/7/14 日回访、日周复盘与事后走势对照 |
| AI 结论依据什么，失败后要不要重来？ | 绑定来源、正文、资料截点与审计账本；长任务可恢复，未知计费不自动重放 |
| 一次讨论如何变成正式研究？ | 显式「整理本次讨论」→ 可编辑语义变更包 → 用户确认后才写入产业项目 |

> **边界声明：** 本项目用于信息整理、研究记录与历史验证，**不构成投资建议**，不承诺收益，**不提供自动交易**或仓位控制。

---

## 下载与安装

**当前公开测试版：** [v0.1.0-beta.5](https://github.com/BigApple12138/RT-ResearchFlow/releases/tag/v0.1.0-beta.5)（Windows 10/11 x64）

| 文件 | 说明 |
|---|---|
| `RT-ResearchFlow-Setup-0.1.0-beta.5-x64.exe` | 安装包 |
| `SHA256SUMS.txt` | 完整性校验 |

```powershell
Get-FileHash .\RT-ResearchFlow-Setup-0.1.0-beta.5-x64.exe -Algorithm SHA256
```

输出应与 Release 页 `SHA256SUMS.txt` 一致。安装包尚未商业代码签名，SmartScreen 提示属预期；请只从本仓库 Releases 下载。

- **安装：** 支持当前用户安装与自选目录；数据默认保存在安装目录下的 `data`。
- **升级：** 自 beta.1–beta.3 升级会保留 `data` 并自动执行向前 Migration。
- **卸载：** 默认询问是否删除本地数据，默认选项为保留。

完整版本说明见 [`docs/releases/v0.1.0-beta.5.md`](docs/releases/v0.1.0-beta.5.md)。

---

## 它解决什么问题

很多工具停在「看数据」或「问一次 AI」。RT-ResearchFlow 把研究连成一条可复盘的工作流：

```mermaid
flowchart LR
    A[资讯与市场信号] --> B[结构化研判]
    B --> C[A股映射与行情复核]
    C --> D[今日看板与判断账本]
    D --> E[回访与日周复盘]
    E --> F[AI讨论与研究增量]

    G[产业问题] --> H[受控取证与图谱]
    H --> I[深度研究]
    I --> J[多视角复核]

    K[板块资金与竞价] --> L[短线线索复核]
    L --> D

    M[策略条件] --> N[历史信号]
    N --> O[持有N日效果]
```

系统不替用户跳过研究过程；它负责把**依据什么、缺什么、之后如何验证**写清楚。

---

## 工作台一览

主导航一级工作台如下（产业研究、策略实验室等通过二级入口进入；配置中心经底部入口以抽屉打开，消息中心为标题栏通知入口）：

| 工作台 | 回答的问题 | 要点 |
|---|---|---|
| **今日看板** | 今天先处理什么？ | 今日提炼、持仓风险、策略信号、盘前推演、一键复盘、判断账本与回访 |
| **股票走势图** | 这只股近期结构怎样？ | 日 K/分时、MA、BOLL、筹码、基本面按需补齐、公共股票抽屉 |
| **长线趋势** | 谁在转强或走弱？ | 持仓总览、趋势雷达、趋势事件、观察池、结构研判与 AI 第二意见徽章 |
| **大盘云图** | 指数/行业/资金是否共振？ | 行业云图、市场共振、板块资金历史回看、次日竞价观察 |
| **短线策略** | 有哪些可复核短线线索？ | 早盘竞价主线、尾盘/涨停/连板/首阴/低吸、策略实验室与效果评估 |
| **资讯** | 今天有哪些消息值得看？ | RSS/Atom 扫描、分组、影响评级、归档与一键 AI 分析 |
| **AI 分析** | 如何持续研判与深挖？ | Cursor 式会话面、Agent 工作台、深度研究、研究讨论与增量 |
| **配置中心** | 数据源、AI、Agent 怎么配？ | 底部入口抽屉打开；Tushare/自定义网关、多 Provider、联网搜索、本机 MCP、数据目录 |

---

## 本 fork 相对上游的增量（beta.5）

在合入 upstream 零 Key 公共日线、板块历史、云图抛光等能力之外，本仓库额外包含：

| 能力 | 说明 |
|---|---|
| **Agent Context Engine** | 讨论自动/手动压缩、研究笔记 flush、检查点列表与恢复 |
| **Agent 工作台（Agent Hub）** | Planner–Executor 回合、本地只读 Tool、HITL 写闸门、外部 MCP 投影 |
| **Cursor 式 AI 会话面** | 可折叠侧栏、Agent 正文流式、深度研究时间线块 |
| **趋势 AI 锚定偏差分** | 本地结构复核与 AI 第二意见并排；EOD 事实绑定，不随盘中刷新误作废 |
| **自定义数据目录（FR-265）** | 引导文件 + 智能迁移，窄 IPC，env 锁定只读 |
| **指数分时专业版** | 预设指数蜡烛 + VWAP，带后缀缓存键 |
| **工程门禁** | SDD 归档、合入 `develop`/`main` 的 PR 须先 Review |

---

## 决策与复盘闭环

入口：**决策中心 → 今日看板**。

1. **提炼与直达：** 优先展示值得处理的事实、证据缺口与行动入口；指标可跳到对应工作台。
2. **保存判断：** 记录结论标签、证据快照、反证、未知项与下一次回访日期。
3. **按期回访：** 3/7/14 日选择维持、修正或结束；复盘积压支持逐条或批量收口。
4. **形成复盘：** 本地事实报告先落盘；AI 已配置时再追加研判，失败仍保留本地报告。
5. **对照结果：** 成熟后把判断与真实走势对照；缺口显式展示，不包装成命中。
6. **继续研究：** 从信号、判断或复盘进入 AI 讨论，保留来源上下文与返回位置。

**盘前推演**（今日看板标题区）：08:45 外盘与持仓事实 → 09:28 竞价确认（事实封顶 09:30）→ 18:00 盘后验证；修订按 R1/R2/R3 不可变保存，晚采事实不得倒灌进历史版本。

---

## AI 研判与 Agent 工作台

### 资讯分析与第二轮复核

普通分析回答「这条消息与哪些 A 股有关」：第一轮结构化映射，第二轮读取本地或接口中的真实行情复核趋势与支撑压力。缺口会明确提示，不伪造第二轮结论。

### 持续讨论与研究增量

信号、判断、日报、周报、产业项目均可进入**同一套研究讨论**。讨论保留受限来源上下文；**不会**自动改写正式产业研究。只有用户点击「整理本次讨论」后，才生成 3–7 个可编辑语义变更包，确认接受后才增量写入产业项目。

### Agent 工作台（`ai:agentTurn`）

- **目标驱动回合：** 计划 → 工具 → 正文；时间线展示 plan/status/tool/message/HITL。
- **Context Engine：** 发模前统一装配硬事实、累计摘要与热尾；超窗自动压缩；可列检查点并「恢复最近整理」。
- **工具边界：** 本地只读 Tool 免确认；`research.deep_start`、外部 MCP 等为 network Tool，须开启「允许 Agent 联网」。
- **与联网搜索解耦：** 观察池「联网补充分类」、深度研究 `web.search` 走「本应用联网搜索」配置，不依赖 Agent 联网闸门。

### 深度研究

从会话意图或 Agent 调用进入五阶段流水线（计划、取证、综合、审计、写回）。运行在主进程，账本可恢复；证据不足时只产出受限或受阻结果，不用模型常识补齐。完成后可进行**多视角复核**（多方/空方/中立，只复用父运行不可变证据，不重新取数）。

---

## 数据与零 Key 路径

**本地 SQLite** 是权威事实源：资讯、行情缓存、持仓、观察池、策略信号、研究项目、AI 会话、判断账本与运行审计。

| 来源 | 角色 |
|---|---|
| **Tushare**（可选） | 更完整的日线、财务、题材、筹码等；支持自定义 API 网关地址 |
| **公共证券池 + 历史日线** | 无 Token 或权限不足时的冷启动底座（Migration 156）；多源 OHLCV 统一口径与来源追踪 |
| **东方财富 / 新浪 / 腾讯等公开接口** | 单股补齐、盘前历史分钟、零 Key 降级路径 |
| **用户 AI Provider** | Claude、OpenAI-compatible、Qwen、DeepSeek 等 |
| **受控网页搜索 / PDF** | 仅深度研究证据不足且用户已配置时使用 |

公共全市场补采采用全局限流与可续跑检查点；界面表达为「通常约 2 小时」。不同网络与权限会导致覆盖差异，界面尽量展示来源、事实日期与失败原因。

---

## 产品预览

主图与下列 `<details>` 中的扩展图均来自 `docs/screenshots/`，与 **beta.5** 当前 UI 对齐。可用文末脚本一键全量重拍（内置 E2E 演示种子，无需手工造数）。

### 今日看板

![每日工作台](docs/screenshots/001.png)

### 决策、回访与讨论沉淀

![从讨论到研究增量](docs/screenshots/research-discussion-increment.png)

<details>
<summary>研究讨论与语义变更包</summary>

![研究讨论增量 1](docs/screenshots/research-discussion-increment-1.png)
![研究讨论增量 2](docs/screenshots/research-discussion-increment-2.png)

</details>

### Agent 工作台（Agent Hub）

![Agent 回合时间线](docs/screenshots/agent-hub.png)

<details>
<summary>写操作 HITL 与上下文检查点</summary>

![Agent HITL 确认条](docs/screenshots/agent-hub-2.png)
![Agent Context Engine 检查点](docs/screenshots/agent-context-checkpoints.png)

</details>

### 盘前推演

![盘前情景](docs/screenshots/premarket-scenario.png)

<details>
<summary>推演结果与盘后验证</summary>

![盘前推演结果验证](docs/screenshots/premarket-scenario-2.png)

</details>

### 资讯与 AI 分析

![资讯情报台](docs/screenshots/news-ai-analysis.png)

<details>
<summary>AI 分析进度与结构化结果</summary>

![AI 分析加载中](docs/screenshots/news-ai-analysis-loading.png)
![A 股映射与影响研判](docs/screenshots/news-ai-analysis-result.png)
![走势与支撑压力复核](docs/screenshots/news-ai-analysis-result-2.png)
![结构化结论与证据](docs/screenshots/news-ai-analysis-result-3.png)

</details>

### 产业研究

![产业研究工作台](docs/screenshots/industry-research.png)

<details>
<summary>产业图谱、公司财报与研究证据</summary>

![产业研究 2](docs/screenshots/industry-research-2.png)
![产业研究 3](docs/screenshots/industry-research-3.png)
![产业研究 4](docs/screenshots/industry-research-4.png)
![产业研究 5](docs/screenshots/industry-research-5.png)
![产业研究 6](docs/screenshots/industry-research-6.png)
![产业研究 7](docs/screenshots/industry-research-7.png)

</details>

### 深度研究与多视角复核

![深度研究](docs/screenshots/deep-research-review.png)

<details>
<summary>证据页与复核详情</summary>

![深度研究详情](docs/screenshots/deep-research-review-2.png)

</details>

### 个股走势与筹码

![股票抽屉](docs/screenshots/stock-chip-drawer.png)

<details>
<summary>筹码变化与结构事实</summary>

![筹码结构](docs/screenshots/stock-chip-drawer-2.png)
![策略评估筹码视图](docs/screenshots/strategy-evaluation-2.png)

</details>

### 长线趋势

![长线趋势](docs/screenshots/long-term-trend.png)

### 大盘云图与板块资金

![大盘云图](docs/screenshots/market-cloud-map.png)

<details>
<summary>板块资金走势与历史回看</summary>

![大盘云图 2](docs/screenshots/market-cloud-map-2.png)
![大盘云图 3](docs/screenshots/market-cloud-map-3.png)

</details>

### 早盘竞价与短线工作台

![早盘竞价](docs/screenshots/morning-auction-workbench.png)

<details>
<summary>竞价历史效果评估</summary>

![早盘竞价历史](docs/screenshots/morning-auction-workbench-1.png)

</details>

### 策略实验与效果评估

![策略评估](docs/screenshots/strategy-evaluation.png)

<details>
<summary>规则配置与样本可信度</summary>

![策略条件配置](docs/screenshots/strategy-evaluation-1.png)
![效果与样本覆盖](docs/screenshots/strategy-evaluation-3.png)
![策略横向比较](docs/screenshots/strategy-evaluation-4.png)

</details>

### 数据质量与 AI 评测

![质量中心](docs/screenshots/quality-center.png)

更多未收录截图见 [`docs/screenshots/`](docs/screenshots/)。

### 刷新产品截图

在仓库根目录执行（会先 `build`，再启动 Electron 写入 `docs/screenshots/`）：

```powershell
pnpm run build
pnpm run screenshots:product
```

与 Release 一致时，可改用已打包应用：

```powershell
$env:TRADE_WATCH_PACKAGED_EXECUTABLE = "release\win-unpacked\RT-ResearchFlow.exe"
pnpm run screenshots:product
```

脚本覆盖 README 引用的全部产品图文件名（今日看板、盘前推演、资讯与 AI 研判、产业研究、深度研究、趋势、大盘云图、早盘竞价、策略评估、质量中心等），演示数据由 `tests/e2e/helpers/` 下种子脚本写入临时库。

---

## 架构

```text
RT-ResearchFlow/
├─ src/                 React 18 + Zustand + Tailwind 渲染层
├─ electron/
│  ├─ preload/          窄类型 IPC（window.api）
│  └─ main/             SQLite、行情、AI、研究与安全网络出口
├─ skills/              应用内投研技能（巴菲特/产业链等）
├─ tests/               Vitest + Playwright
└─ docs/                发版说明、社区文档、SDD 归档
```

```text
React Renderer  →  Sandbox Preload  →  Electron Main
                      窄 IPC              ├─ SQLite / FTS5
                                          ├─ 行情与策略服务
                                          ├─ AI 与可恢复研究运行器
                                          ├─ 受控联网出口
                                          └─ 本机 MCP 网关
```

Renderer **不**直接持有凭据、数据库连接或任意网络权限；新能力走主进程校验与白名单 IPC。

模块级行为说明见 [`src/components/*/README.md`](src/components/AIAnalysis/README.md)（含 FR 约束）。

---

## 快速开始

### 环境要求

- Node.js **20.x** LTS
- pnpm **10.x**（仓库锁定 `pnpm@10.14.0`）
- Windows 10/11 x64（当前主要开发与安装包验证环境）

Windows 上若符号链接权限不足：

```powershell
pnpm install --config.node-linker=hoisted
```

### 从源码运行

```powershell
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

首次启动**不要求**配置 AI 或 Tushare。可先体验公开数据路径、观察池与本地趋势；需要更完整数据或 AI 时再在配置中心添加凭据。

### 构建 Windows 安装包

```powershell
pnpm run dist:win
```

等价于生产构建 + `electron-builder`（自动禁用代码签名发现）。

---

## 配置要点

| 位置 | 内容 |
|---|---|
| **数据源** | Tushare Token、可选自定义 API 地址、验证与保存 |
| **AI** | 多 Provider、模型、Base URL、凭据（主进程加密） |
| **Agent** | 本应用联网搜索、Agent 联网闸门、本机研究访问、外部 MCP |
| **设置** | 扫描频率、盘前采集、通知、**自定义数据目录**、产业链维护 |

深度研究在创建时固定 Provider、模型与资料截点，运行中不静默切换备用模型。

---

## 测试与质量门禁

```powershell
pnpm run typecheck
pnpm run lint
pnpm run test:unit
pnpm run build
pnpm run verify
./.github/scripts/Test-PublicBoundary.ps1
```

`pnpm run verify` = TypeScript + ESLint + 单元测试（Electron ABI）+ 生产构建。

常用 E2E 旅程：

```powershell
pnpm run test:e2e -- tests/e2e/zero-key-first-value.spec.ts
pnpm run test:e2e -- tests/e2e/premarket-scenario-drawer.spec.ts
pnpm run test:e2e -- tests/e2e/research-agent-recovery.spec.ts
pnpm run test:e2e -- tests/e2e/user-journey.spec.ts
```

自动测试使用注入 Provider 或隔离数据库，**不**连接真实付费模型。

---

## 安全与隐私边界

- 数据以本地 SQLite 为权威；安装版数据在 `data` 目录（可自定义根路径）。
- 凭据由主进程加密管理，不进入 renderer、研究账本或普通日志。
- Electron 启用 `sandbox` 与 `contextIsolation`；禁用 `nodeIntegration`。
- Agent 联网经独立安全出口，阻断私网、危险重定向与超大响应。
- 深度研究搜索只登记候选；正文须经主进程安全解析后才计为证据。
- 请求提交后失联进入「结果未知」，同一账本**禁止**自动重放。
- 本机 MCP 默认关闭，只读用户授权的事实范围；不开放 SQL/Shell/交易动作。
- 盘前联网默认关闭；休市回看只读本地冻结版本。

---

## 已知限制

与 [`docs/releases/v0.1.0-beta.5.md`](docs/releases/v0.1.0-beta.5.md) 的「已知限制」保持一致：

- 本次只提供 Windows x64 安装包，macOS 尚未纳入发布验收。
- 安装包尚未进行商业代码签名。
- 策略实验室「通用日线 DSL / 两阶段组合」仍留给后续批次。
- 云端分钟数据服务（`minuteData:saveCloudConfig`）尚未启用。
- 竞价价史 snapshot IPC 在冷启动大批量候选时仍可能较长阻塞（已知技术债）。
- 应用不执行下单、自动交易、仓位控制或收益预测。

以上以当前版本 Release 说明为准，后续版本如有变化以对应 [`docs/releases/`](docs/releases/) 文档为准。

---

## 路线图

以下为方向性计划，由 [`docs/releases/v0.1.0-beta.5.md`](docs/releases/v0.1.0-beta.5.md)「已知限制」反推而来，**不承诺交付时间**：

- 策略实验室「通用日线 DSL / 两阶段组合」落地。
- 云端分钟数据服务（`minuteData:saveCloudConfig`）启用。
- 竞价价史 snapshot IPC 冷启动性能债清理。
- 安装包商业代码签名。
- macOS 纳入发布验收。
- 其余方向以 Discussions Ideas 中用户反馈为准；以上条目也适合作为 `good first issue` / `help wanted` 的出处，欢迎认领。

---

## 项目原则

1. **本地优先** — 持仓、研究记录与审计不依赖云端账户。
2. **事实与结论分开** — 来源、事实日、覆盖与未知项不能被 AI 文本替代。
3. **用户显式触发** — 联网、刷新、AI 调用、继续运行与正式纳入研究都需明确动作。
4. **失败可恢复** — 长任务保存阶段与结果；成功步骤不重复；未知计费不自动重放。
5. **结论可被反驳** — 必须能查看反证、分歧与下一步验证项。
6. **不越过交易边界** — 不接券商下单，不提供自动调仓、目标价指令或收益承诺。

---

## 反馈与支持

按问题类型选择渠道，全部在本仓库：

| 场景 | 渠道 |
|---|---|
| 可复现 Bug | [提交 Issue](https://github.com/BigApple12138/RT-ResearchFlow/issues/new/choose)，附版本、复现步骤、预期与实际结果 |
| 安装与使用问题 | [Discussions Q&A](https://github.com/BigApple12138/RT-ResearchFlow/discussions/categories/q-a) |
| 功能想法 | [Discussions Ideas](https://github.com/BigApple12138/RT-ResearchFlow/discussions/categories/ideas) |
| 安全问题 | [Security 私密报告](https://github.com/BigApple12138/RT-ResearchFlow/security/advisories/new)，不要创建公开 Issue |

参与前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 与 [SECURITY.md](SECURITY.md)。

---

## 贡献

欢迎 Pull Request。合入前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md) 与 [`AGENTS.md`](AGENTS.md)；问题反馈与功能想法请先见上方 [反馈与支持](#反馈与支持) 的对应渠道。

- 功能与行为变更走 **SDD**（spec/plan 归档于 `docs/superpowers/`）。
- 至少执行 `pnpm run verify` 与公开边界脚本。
- **合入 `develop`/`main` 的 PR 必须先 Review。**
- 勿提交 API Key、Token、数据库、日志、持仓或个人路径。

---

## 免责声明

本项目仅用于信息整理、软件研究、个人投研记录和历史验证，不构成任何证券、基金或其他金融产品的投资建议。市场数据和公开资料可能延迟、缺失或错误，AI 输出也可能存在遗漏与幻觉。任何结论都应由用户独立核实，投资决策与风险由用户自行承担。

---

## 赞赏

若本工具对你有帮助，也可向**原作者**表达支持（赞赏图来自原项目）：

[![请原作者喝杯咖啡](docs/screenshots/support-caoritian.jpg)](https://github.com/caoritian002-wq/RT-ResearchFlow)

原项目：[caoritian002-wq/RT-ResearchFlow](https://github.com/caoritian002-wq/RT-ResearchFlow)

---

## License

社区版基于 **GNU Affero General Public License v3.0 only**（`AGPL-3.0-only`）发布，完整条款见 [LICENSE](LICENSE)。

版权所有者保留提供独立商业许可证的权利。闭源集成、闭源再分发或其他不符合 AGPL-3.0-only 的商业使用，须另行取得商业授权。
