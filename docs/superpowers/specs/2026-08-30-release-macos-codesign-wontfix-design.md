# 发布侧 macOS / 代码签名 — 本程序排除结案

**状态：** 书面结案不做（本缺口闭环程序排除）  
**日期：** 2026-08-30  
**挂靠：** [`2026-08-30-gap-closure-program-design.md`](./2026-08-30-gap-closure-program-design.md) §3 / §4.7

## 结论

本程序**不交付**：

1. macOS 安装包与 macOS 发布验收  
2. 商业代码签名（Windows Authenticode / Apple notarization 等）

Windows x64 安装包路径保持现状；已知限制继续写明「仅 Windows x64」。

## 理由

属发布工程，非产品功能缺口；总控默认排除。另开「发布工程」SDD 后再做。

## 重启条件

独立发布工程 design + 证书/CI 资源到位。
