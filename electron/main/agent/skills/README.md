# Agent Skills（第一期）

本目录存放 **Agent Hub 剧本 Skill**：给 Orchestrator 组装系统提示用的短说明书，**不是**仓库根目录 `skills/` 下给用户挑选的方法论包（巴菲特/产业链等）。

## 约定（第一期薄、接口先立）

1. **目录**：每个 Skill 一个子目录，入口文件为 `SKILL.md`（可选 YAML front-matter：`name` / `description` / `version`）。
2. **职责**：说明何时调用哪类 Tool、完成判据与硬禁止项；**不**负责选模型、不执行 Tool。
3. **默认**：第一期只加载 `research-assistant` 一份默认剧本；系统提示 = Skill 正文 + `ToolRegistry.listForPrompt()` + 禁止项/协议块。
4. **接口先立**：后续可加 SkillLoader（按名加载、内容 hash 快照、多 Skill 热加载）；本期不做 intent-classifier、不做 `npx skills add` 安装器。
5. **边界**：剧本不得削弱「非投顾 / 不荐股 / 不自动交易」产品硬边界。

## 当前 Skill

| 目录 | 用途 |
|---|---|
| `research-assistant/` | 默认投研助手薄剧本 |
