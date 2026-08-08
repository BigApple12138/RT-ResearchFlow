# 文档索引

本目录按用途分开存放，避免把开发过程稿与对外发布文混在一起。

| 路径 | 用途 | 谁写 |
|---|---|---|
| [`community/`](community/) | GitHub Discussions 首发、社区上线检查清单 | 维护者（发布/社区） |
| [`releases/`](releases/) | 版本说明、干净机验证清单 | 维护者（发版） |
| `screenshots/` | README 与说明用产品截图 | 维护者 |
| [`superpowers/specs/`](superpowers/specs/) | 已批准的功能设计（做什么、边界、坑、验收） | 功能开发前 |
| [`superpowers/plans/`](superpowers/plans/) | 可执行实现计划（任务、文件路径、测试命令） | 设计批准后、写业务代码前 |

## 命名

- 设计：`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- 计划：`docs/superpowers/plans/YYYY-MM-DD-<feature>.md`

## 相关约定

- 跨工具 Agent 规范：仓库根目录 [`AGENTS.md`](../AGENTS.md)
- 人类贡献入口：[`CONTRIBUTING.md`](../CONTRIBUTING.md)
- 运行时行为与 FR：各模块旁 `src/components/*/README.md`（不以本目录替代）
