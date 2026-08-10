# DataSource — 数据源配置

配置 Tushare Pro 等行情入口，供 AI 二轮分析与本地行情同步使用。

## 行为

- 启用开关、API Token（加密存库，界面可不回显明文）、可选 **API 地址**。
- API 地址留空 → 官方 `https://api.tushare.pro`；自定义须为 `http://` 或 `https://`（私有网关常用 http）。
- 「验证」使用当前表单中的 Token + API 地址；「保存」持久化后，主进程全部 Tushare 请求走同一解析地址。
- 不在 Renderer 直连 Tushare；经 `window.api.datasource.*` 窄 IPC。

## FR

- FR-054：Tushare 数据源配置与 Token。
- FR-054-ext：可选自定义 Tushare REST 基址（2026-08-10）。
