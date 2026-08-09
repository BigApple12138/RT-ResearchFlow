# SDD 过程文档（归档）

本目录是本仓库 **Spec-Driven Development（SDD）** 的过程真相与归档库，不是发版说明。规范见根目录 [`AGENTS.md`](../../AGENTS.md)。

## 核心 vs 工具（显式说明）

- **核心是 SDD**：Specify → Plan/Tasks → Implement → Validate（对照规格检核初衷）。规格与计划必须落盘进本目录并提交 git。
- **Superpowers skills 是工具**：可借鉴（brainstorming、writing-plans 等），用来辅助走完各阶段；**可以不用某个 skill，但不能跳过 SDD**。
- 目录名里的 `superpowers` 只表示历史/工具习惯路径，**不表示方法论叫 superpowers**。

档位：本仓库取 **spec-anchored**（规格与代码并存，供事后检核）。社区概念见 GitHub Spec Kit / Microsoft SDD 文章（链在 `AGENTS.md`）。

| 子目录 | 归档内容 | 检核用途 |
|---|---|---|
| [`specs/`](specs/) | 设计初衷：问题、目标、非目标、验收、边界 | 实现前后对照「当初要做什么 / 不做什么」 |
| [`plans/`](plans/) | 可执行计划：任务、文件、测试、提交节奏 | 对照是否按批准路径落地；完成后勾选与偏差记录 |

## 硬性约定

1. **必须落盘**：走 SDD 的功能，design 与 plan **都要**以 Markdown 提交进本目录；禁止只活在聊天记录里。
2. **互相链接**：plan 文首必须链到对应 spec；spec 可链回 plan。
3. **状态字段**：文首标明 `状态`（如：起草 / 已批准待执行 / 执行中 / 已完成 / 已偏离需修订）。
4. **完成后检核**：功能宣称完成后，在 **同一份 plan** 末尾填写「设计初衷检核」表（对照 spec 验收项：符合 / 偏差 / 未做及原因）。不得删改历史设计正文来掩盖偏差；若产品决策变更，**新增**修订说明或新日期文档，并在旧文档状态中标注被取代。
5. **禁止**：把过程稿写进 `docs/community/`、`docs/releases/`；禁止用「口头说过」或「用过某个 skill」替代归档。

## 命名

- 设计：`specs/YYYY-MM-DD-<topic>-design.md`
- 计划：`plans/YYYY-MM-DD-<feature>.md`（feature 名与 design topic 对齐，便于检索）
