# 文档索引

本目录按用途分开存放，避免把开发过程稿与对外发布文混在一起。

| 路径 | 用途 | 谁写 |
|---|---|---|
| [`community/`](community/) | GitHub Discussions 首发、社区上线检查清单 | 维护者（发布/社区） |
| [`releases/`](releases/) | 版本说明、干净机验证清单 | 维护者（发版） |
| `screenshots/` | README 与说明用产品截图 | 维护者 |
| [`superpowers/`](superpowers/README.md) | **SDD** 过程归档总说明（核心是 SDD；superpowers 仅为工具路径名） | Agent / 贡献者 |
| [`superpowers/specs/`](superpowers/specs/) | SDD 设计初衷归档 | 功能开发前；完成后对照检核 |
| [`superpowers/plans/`](superpowers/plans/) | SDD 实现计划归档 + 文末「设计初衷检核」 | 设计批准后、写代码前；完成后勾选与偏差记录 |

## 命名

- 设计：`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- 计划：`docs/superpowers/plans/YYYY-MM-DD-<feature>.md`

Plan **必须**提交进仓库归档，并链到对应 spec。完成后在 plan 末尾做设计初衷检核。详见 [`superpowers/README.md`](superpowers/README.md) 与根目录 [`AGENTS.md`](../AGENTS.md)。

## 相关约定

- 跨工具 Agent 规范：仓库根目录 [`AGENTS.md`](../AGENTS.md)
- 人类贡献入口：[`CONTRIBUTING.md`](../CONTRIBUTING.md)
- 运行时行为与 FR：各模块旁 `src/components/*/README.md`（不以本目录替代）
