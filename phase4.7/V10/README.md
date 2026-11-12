# V10 静态契约工具

本目录是 `phase4.7/V10/` 的受限静态实现。它不是发布器、恢复器、lab 或 Phase 0 执行包。

## 文件

```text
SPEC-V10.md                 唯一执行规格；H1—H5 优先于 215522 冲突条文
p0v10-lib.cjs               纯 canonical/hash/path/结果码工具
p0v10-contract.cjs          纯契约函数（链、停止、summary、错误码、门禁、锁、保护、成员）
p0v10-check.cjs             只读契约检查器；不写文件、不启动进程
p0v10-independent-check.cjs 独立只读检查器：不 import contract，重算链/gate/summary/sidecar 关键不变量
inputs/                     钉扎静态输入（exec/trigger/failure map/protect/gate/member）
schema/                     JSON Schema（lock/journal/gate/seal/sidecar/protect/member）
vectors/vectors.json        静态向量（链/停止/summary/门禁/错误码/锁/保护/成员）
tests/TEST-DESIGN.md        测试设计与 Q01—Q14 映射
```

## 只读检查

```powershell
node --check p0v10-lib.cjs
node --check p0v10-contract.cjs
node --check p0v10-check.cjs
node p0v10-check.cjs --json
node p0v10-independent-check.cjs
```

`p0v10-check.cjs` 只使用 `fs.readFileSync`、`JSON.parse` 和纯函数；不写文件、不创建目录、不启动子进程、不调用发布/恢复/lab。

## 当前状态

- 静态向量：全部 PASS（见 `p0v10-check.cjs --json`）。
- 运行时/发布/恢复/崩溃/并发：NOT_RUN；真实 scratch 实验需用户单独授权。
- 本目录不修改 V9/V8/V7、历史证据、产品源码/测试/依赖/锁文件/dist。
