# 自定义数据目录

**状态：** 已实现（含修订二）  
**日期：** 2026-08-13  
**Plan：** 批准后写入 [`../plans/2026-08-13-custom-data-directory.md`](../plans/2026-08-13-custom-data-directory.md)

## 1. 问题

应用数据（SQLite 库、日线/分时缓存、会话档案、日志）随使用持续增长，而数据目录位置目前完全由启动模式硬编码：

- 开发模式：`%APPDATA%\rt-research-flow-dev`
- Windows 安装版：`<安装目录>\data`
- 其他平台：默认 userData

用户无法在后期把数据迁到其他盘，C 盘空间逐渐被撑爆。

**核心难点（鸡生蛋）**：应用偏好存储在数据目录内的 SQLite（`app_settings`）中，而「数据目录在哪」必须在打开数据库之前就知道。因此需要一个先于数据库存在的独立引导配置通道。

## 2. 目标

1. 默认路径保持不变，不改变任何现有用户的现状。
2. 用户可在设置页将数据目录改到任意本地路径，重启生效；数据随迁移完整保留。
3. 支持环境变量 `RT_DATA_ROOT` 覆盖（开发、多实例、自动化场景）。
4. 切换目标目录时智能判断：已有应用数据则直接复用；空目录则带校验复制迁移；冲突或不可写时明确报错、不破坏任何数据。
5. 大数据库迁移期间给用户可见反馈，不黑屏。

## 3. 非目标

- 不做多数据档案快速切换 UI（用户可手动改引导文件实现，但不是产品功能）。
- 不做网络路径 / 移动磁盘的特殊检测与支持（按普通本地路径处理）。
- 不做后台增量同步或热切换；迁移期间应用不可用，必须重启。
- 不改变安装版 `<安装目录>\data` 的便携默认语义。
- 不迁移引导配置文件本身（它必须留在固定位置才能被发现）。

## 4. 设计

### 4.1 引导配置文件

新增固定位置的引导文件 **`data-root.json`**，存放于平台默认 userData 目录（`app.getPath('userData')`，即 `%APPDATA%\rt-research-flow`）——该位置在开发与安装模式、数据根迁移前后均不变，因此永远可被发现。

文件结构：

```json
{ "version": 1, "target": "D:\\rt-research-flow-data", "updatedAt": 1755052800000 }
```

读写函数（`applicationDataPathService.ts` 新增导出）：

- `readDataRootOverride(bootstrapDir): string | null` —— 文件缺失、JSON 损坏、`target` 非字符串时返回 `null` 并记录 warn（损坏不阻塞启动，退回默认）。
- `writeDataRootOverride(bootstrapDir, target): void` —— 原子写（临时文件 + rename）。
- `clearDataRootOverride(bootstrapDir): void` —— 删除文件（不存在时静默成功）。

### 4.2 解析优先级

在 `configureApplicationDataPaths()` 内、任何数据库操作之前解析：

1. 环境变量 `RT_DATA_ROOT`（非空时最高优先，去除首尾空白后 resolve 为绝对路径）
2. 引导配置文件 `data-root.json`
3. 模式默认（现状不变：dev 加 `-dev` 后缀 / Windows 安装版 `<安装目录>\data` / 其他平台默认 userData）

来源信息（`env` / `file` / `null`）随解析结果返回，供设置页展示。

### 4.3 切换语义（智能判断）

新增 `prepareCustomDataRoot({ currentRoot, targetRoot })`，复用现有 `prepareApplicationDataRoot` 的复制 + SHA 校验 + 暂存区回滚机制：

| 目标状态 | 行为 |
|---|---|
| 与当前根相同 | 无操作 |
| 已含应用数据（marker / `trade-watch.db*`） | 直接复用（支持多套数据环境切换） |
| 空目录或不存在 | 从当前根复制迁移：暂存区复制 → 逐文件校验 → rename 生效；失败删除暂存区，当前根不动 |
| 含未知文件 | 抛 `DATA_DIRECTORY_CONFLICT`，拒绝覆盖 |

复制排除瞬态文件（`Singleton*`、`LOCK` 等），与现有迁移逻辑一致。凭据安全：`session/Local State`（safeStorage 密钥）随数据根整体复制，AI 与搜索凭据迁移后仍可读。

### 4.4 启动流程两段化（index.ts）

现状：`configureApplicationDataPaths()` 在模块顶层同步执行（含可能的复制）。改造为：

- **阶段 A（模块顶层，轻量）**：解析 override、判定目标。若无需复制（无 override / 复用已有数据 / 与当前相同），立即 `setPath` 生效，与现状等价。
- **阶段 B（`app.whenReady()` 后，仅复制场景）**：先创建一个极简无框「正在迁移数据，请勿关闭应用」小窗口，再执行复制，完成后销毁小窗、继续正常 `bootstrap()`；失败走现有 `showFatalErrorWindow` 路径。

### 4.5 窄 IPC（新增 `ipc/dataRootHandlers.ts`）

| 通道 | 入参 | 返回 |
|---|---|---|
| `dataRoot:getStatus` | 无 | `{ currentRoot, overrideTarget, overrideSource: 'env' \| 'file' \| null, mode }` |
| `dataRoot:selectDirectory` | 无 | `string \| null`（原生目录选择对话框） |
| `dataRoot:setCustomRoot` | `path: string` | `{ ok: true, requiresRestart: true }` 或 `{ ok: false, errorCode, message }` |
| `dataRoot:clearOverride` | 无 | 同上 |

校验：`setCustomRoot` 要求绝对路径、目录或可创建的父目录、可写探测、与当前根不同；全部通过才写引导文件。处理器校验 `event.sender` 归属主窗口。`clearOverride` 仅在来源为 `file` 时有效（env 来源提示用户改环境变量）。

### 4.6 设置页 UI（Settings「数据存储」区块）

- 展示当前数据目录路径 + 来源标签（默认 / 配置文件 / 环境变量）。
- 「更改目录」→ 原生选择 → 应用内二次确认（说明：重启生效；目标为空时将复制现有数据，期间不可使用应用）→ 成功后 Toast + 「立即重启」按钮（复用 `app:relaunch`）。
- 存在 file 来源 override 时显示「恢复默认」；env 来源时只读提示。
- 冲突 / 不可写等错误以明确中文文案展示。

### 4.7 错误码表

| errorCode | 含义 |
|---|---|
| `DATA_DIRECTORY_NOT_WRITABLE` | 目标或父目录不可写 |
| `DATA_DIRECTORY_CONFLICT` | 目标含未知文件，拒绝覆盖 |
| `DATA_MIGRATION_FAILED` | 复制 / 校验失败，已回滚，原数据未动 |
| `DATA_ROOT_SAME_AS_CURRENT` | 目标与当前相同（前端拦截，非错误弹窗） |
| `DATA_ROOT_INVALID_PATH` | 非绝对路径或含非法字符 |
| `DATA_ROOT_ENV_LOCKED` | env 生效中，clearOverride 不可用 |

## 5. 验收

| # | 期望 |
|---|---|
| A | 未设置任何 override 时，三种模式的默认路径与现状完全一致 |
| B | 设置页改目录 → 重启 → 新目录出现完整数据（含 db、session、marker），旧目录保持原样 |
| C | 目标已有应用数据时重启直接进入该环境，无复制 |
| D | 目标含未知文件时报冲突错误，双方目录均不被修改 |
| E | `RT_DATA_ROOT` 优先于引导文件；env 生效时设置页只读提示 |
| F | 引导文件损坏时启动退回默认并 warn，不崩溃 |
| G | 「恢复默认」删除引导文件，重启回到模式默认目录 |
| H | 迁移复制期间显示进度小窗；失败弹致命错误窗且原数据完整 |
| I | 单测覆盖优先级、读写、复制成功 / 回滚 / 冲突；设置页 E2E 覆盖区块展示与状态 |

## 6. 边界与风险

- 大数据库（数 GB）同步复制耗时分钟级，期间应用不可用——以进度小窗与确认文案明确告知，不做后台化。
- dev 模式下 override 按原样使用（不追加 `-dev` 后缀）：用户显式指定即视为知情，需自行区分开发 / 安装数据。
- 引导文件所在目录（默认 userData）被用户手动删除时，等同恢复默认，无数据损失。
- 本次不改数据库 Migration：引导配置独立于 SQLite，不新增表。

## 7. 修订

- 2026-08-13：初稿。
- 2026-08-13（修订二，实现期验证发现）：按 4.4 原方案，阶段 A 在待迁移场景直接把 `userData` 指向目标目录，但 Chromium 会在 `ready` 事件前就在 `userData` 里初始化 profile 文件（Cache、Local Storage、GPUCache 等），把原本为空的目标目录污染成「含未知文件」，导致阶段 B 复制必然报 `DATA_DIRECTORY_CONFLICT`（已用复现脚本证实）。调整为：
  - 阶段 A 待迁移场景把 `userData` 指向 OS 临时目录下的一次性 profile（`trade-watch-data-root-migration-<pid>-<ts>`），复制源与目标目录都保持干净；本进程数据根仍记为复制来源。
  - 阶段 B 复制成功后不再「继续正常 bootstrap()」，而是 `app.relaunch()` + `app.exit(0)` 自动重启使新根生效（Electron 不支持 ready 后切换 `userData`）。用户体感为重启两次（确认后的重启 + 复制完成后的自动重启），进度小窗体验不变。
  - 测试模式（`NODE_ENV=test`，即 E2E）复制完成后只退出不自动拉起新进程，避免 Playwright 失去对重启后进程的控制；验收 B/H 改由「迁移进程退出后目标目录数据完整 + 下次启动进入新环境」验证。
- 2026-08-13（修订三，完成审计发现）：4.3 要求空目标「从当前根复制」，但原实现的复制源固定为模式默认根：连续两次切换自定义目录（A → B）时，B 会拿到模式默认根的旧数据而非正在用的 A。引导文件新增可选 `previousRoot` 字段（`setCustomRoot` 写入时记录当前数据根；旧版无此字段的文件按 null 处理，向前兼容），阶段 A 解析时复制源优先级 `previousRoot` > 模式默认根 > legacy 回退（均要求实际含应用数据且不等于目标）。
