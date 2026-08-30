# 云端分钟 saveCloudConfig（G1）书面结案

**状态：** 书面结案不做  
**日期：** 2026-08-30  
**挂靠：** [`2026-08-30-gap-closure-program-design.md`](./2026-08-30-gap-closure-program-design.md) §4.7 Track G（推荐选项 1）  
**Plan：** [`../plans/2026-08-30-cloud-minute-save-config-wontfix.md`](../plans/2026-08-30-cloud-minute-save-config-wontfix.md)

## 1. 结论

**本程序不实现** `minuteData:saveCloudConfig` 的真实持久化/鉴权启用。

现状保留：

- IPC：`electron/main/ipc/minuteDataHandlers.ts` 返回 `{ ok: false, code: 'NOT_IMPLEMENTED', message: '云端分钟数据服务尚未启用' }`
- 本地/用户提供/近似分钟路径继续可用；UI 不得伪装云端已配置成功

## 2. 理由

1. 无已批准的云端分钟后端契约（endpoint 语义、鉴权、配额、隐私与本地优先边界）。  
2. 总控默认范围（选项 1）：有真实后端方案再单开 SDD；无则书面结案。  
3. 伪实现（只存本地假配置）会误导用户并破坏「诚实能力标注」。

## 3. 非目标（本结案明确不做）

- 不改 handler 为假成功  
- 不新增云端账号体系  
- 不把云端分钟伪装为已启用

## 4. 文档回填

- README / releases「已知限制」：改为「书面结案不做（缺口闭环 G1）；待后端契约后再开 SDD」  
- 路线图：从「即将启用」改为「依赖后端契约，未排期」

## 5. 重启条件

出现经产品批准的后端 API + 密钥存储方案 + 隐私评审后，另开 `*-cloud-minute-config-design.md`，**不复用本结案为实现授权**。
