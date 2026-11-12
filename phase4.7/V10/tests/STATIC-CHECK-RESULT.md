# V10 静态检查结果（本轮）

日期：2026-11-12。性质：只读静态验证；不是发布/恢复/lab/Phase 0 验收。

## 命令与结果

| 命令 | 结果 | 说明 |
|---|---|---|
| `node --check p0v10-lib.cjs` | PASS | 语法解析 |
| `node --check p0v10-contract.cjs` | PASS | 语法解析 |
| `node --check p0v10-check.cjs` | PASS | 语法解析 |
| `node --check p0v10-independent-check.cjs` | PASS | 语法解析 |
| JSON parse（inputs/schema/vectors） | PASS | 只读解析 |
| `node p0v10-check.cjs --json` | PASS 60/60 | 契约向量；`input_map.ok=true` |
| `node p0v10-independent-check.cjs` | PASS | 不 import contract；链/summary/sidecar/输入摘要独立复核 |

## 未执行

- 生成器写正式文件：NOT_RUN（需单独授权）。
- 发布器/恢复器/事务状态：NOT_RUN。
- lab 故障注入/崩溃/并发：NOT_RUN。
- C00—C20、Phase 0、ACL、浏览器/L1：NOT_RUN。
- 真实 Windows 文件系统锁竞争：UNVERIFIED（无运行证据）。
- JSON Schema 外部 meta-validator：UNVERIFIED（本轮只做 JSON 解析与纯函数校验）。

## 结论

静态契约与向量全部通过；动态行为未运行，不能据此宣称发布/恢复/lab 通过。
