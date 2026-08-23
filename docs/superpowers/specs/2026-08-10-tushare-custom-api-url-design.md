# Tushare 可配置 API 地址 — 设计

**状态：** 已完成  

**日期：** 2026-08-10  
**方法论：** SDD  
**关联 plan：** [`../plans/2026-08-10-tushare-custom-api-url.md`](../plans/2026-08-10-tushare-custom-api-url.md)  

## 1. 问题

应用内 Tushare 请求写死官方地址 `https://api.tushare.pro`。部分 token 需经自定义网关访问（对应 Python SDK 的 `pro._DataApi__http_url = "..."`）。当前「数据源配置」仅有 Token、无 API 地址，验证与业务调用均打官方入口，因而出现「您的 token 不对，请确认。」等误报。

## 2. 目标

- 数据源配置支持可选 **API 地址**；留空则使用官方默认 `https://api.tushare.pro`。
- **验证 Token** 与 **全部 Tushare 业务请求** 使用同一解析后的地址。
- 地址与 Token 一并本地持久化；Renderer 不直连 Tushare、不持有明文凭据出主进程边界（Token 仍仅主进程加解密；API 地址为非机密连接配置，可明文存库并由 `getConfig` 回传以便编辑）。
- 允许私有网关常用的 `http://`（不仅 `https://`）。

## 3. 非目标

- 不内置、不硬编码任何第三方代理 IP/域名作为默认值。
- 不改变各 Tushare `api_name` / 参数 / 字段语义，仅改 HTTP 入口。
- 不做多数据源并行路由、负载均衡或按接口拆分不同 URL。
- 不在仓库、截图样例或文档中写入用户真实 Token。

## 4. 行为

1. **UI（数据源配置）**  
   - 新增「API 地址」输入框；placeholder / 说明标明默认官方 URL。  
   - 「验证」使用当前输入框中的 Token + API 地址（地址空则官方）。  
   - 「保存配置」持久化 Token（若填写）、启用开关、API 地址。  
   - 已保存的地址在打开页面时回填；已保存 Token 仍可不回显明文（保持现有「已保存」体验）。

2. **URL 解析**  
   - `null` / 空串 / 仅空白 → `https://api.tushare.pro`。  
   - 非空须以 `http://` 或 `https://` 开头（大小写不敏感）；否则拒绝保存/验证并给出明确中文提示。  
   - 不做 DNS 可达性预检；连接失败走现有网络错误文案。

3. **主进程调用**  
   - `validateTushareToken` 接受可选 `apiUrl`。  
   - 所有经 `TUSHARE_API_URL` / `callTushareApi` 等入口的请求，统一改为「配置值或传入值 → 解析后的 URL」，不得再散落硬编码官方常量于业务分支（常量仅作默认兜底）。

4. **IPC**  
   - `datasource:getConfig`：增加返回已保存的 `tushareApiUrl`（空则 `''` 或省略并由前端当默认）。  
   - `datasource:saveConfig`：接受可选 `tushareApiUrl`。  
   - `datasource:validateTushare`：接受可选 `apiUrl`。

5. **存储**  
   - `data_source_config` 新增可空列 `tushareApiUrl TEXT`（Migration 向前、幂等）。  
   - 空值语义 = 使用官方默认。

## 5. 产品原则

- 本地优先：连接配置存在用户开发/生产库，不上传。  
- 窄 IPC：Renderer 只通过既有 `window.api.datasource.*` 读写。  
- 默认零配置：未填地址时行为与改前完全一致。

## 6. 验收

| # | 场景 | 期望 |
|---|---|---|
| A | 仅 Token、地址留空，官方有效 Token | 验证通过；请求打 `https://api.tushare.pro` |
| B | Token + 自定义 `http(s)://…` 网关 | 验证与后续业务请求均打该地址；保存后重启仍生效 |
| C | 地址为 `file://` 或无协议字符串 | 验证/保存被拒绝，中文提示非法地址 |
| D | 清空已保存地址并保存 | 恢复官方默认行为 |
| E | 未改配置的老库升级 | Migration 成功；既有 Token/开关行为不变 |

## 7. 主要触达路径（实现时）

- `electron/main/database/db.ts`（Migration）  
- `electron/main/database/types.ts`、`dataSourceRepository.ts`  
- `electron/main/services/tushareService.ts`  
- `electron/main/ipc/aiHandlers.ts`（datasource handlers）  
- `electron/preload/index.ts`  
- `src/components/DataSource/DataSource.tsx`（及若存在的模块 README/FR）  

## 8. 安全与合规备注

- 用户 Token 不得写入 git、日志明文或对外文档。  
- 自定义网关为用户自担信任边界；产品不替用户审计第三方代理。  
- 不构成投资建议；本改动仅影响行情数据入口配置。
