# 真实样本库总结

## ✅ 收集完成

**日期：** 2026-11-08  
**状态：** 通过  
**样本数：** 5 个  
**总大小：** 1.27 MB

---

## 📋 样本清单

| ID | 名称 | 来源 | 类型 | 大小 | CI/CD |
|----|------|------|------|------|-------|
| 1 | sample-01-obfuscator | js-deobfuscator | javascript-obfuscator | 15KB | ✅ |
| 2 | sample-02-maoyan | js-deobfuscator | 商业混淆（猫眼） | 299KB | ❌ |
| 3 | sample-03-pdd | js-deobfuscator | 企业级（拼多多） | 269KB | ❌ |
| 4 | sample-04-gk | js-deobfuscator | 重度混淆 + Hex | 642KB | ❌ |
| 5 | sample-05-cx | js-deobfuscator | 标准商业 | 41KB | ✅ |

---

## 🔗 来源详情

### 主要来源

**仓库：** https://github.com/kuizuo/js-deobfuscator

- ⭐ Stars: 1.2k
- 📜 License: MIT  
- 🔨 Maintained: Active
- ✅ Verified: Public & Trusted

### 样本路径

1. **sample-01**: `/example/obfuscator/`
2. **sample-02**: `/example/maoyan/`
3. **sample-03**: `/example/pdd/`
4. **sample-04**: `/example/gk/`
5. **sample-05**: `/example/cx/`

---

## 📊 混淆类型覆盖

| 混淆类型 | 样本数 | 示例 |
|----------|--------|------|
| javascript-obfuscator | 1 | sample-01 |
| 商业混淆 | 1 | sample-02 |
| 企业级混淆 | 1 | sample-03 |
| Hex 编码 | 1 | sample-04 |
| 标准混淆 | 1 | sample-05 |

### 特性覆盖

- ✅ Base64 字符串编码
- ✅ 数组旋转 (shift/push)
- ✅ 控制流扁平化
- ✅ Anti-debug 保护
- ✅ Dead code injection
- ✅ Self-defending
- ✅ Hex 编码标识符
- ✅ 多层解码器
- ✅ Anti-tampering 保护
- ✅ 真实生产代码

---

## 🎯 测试用途

### sample-01-obfuscator (15KB)
✅ **CI/CD**  
**用途：** 基准测试、快速验证、javascript-obfuscator 标准输出

### sample-02-maoyan (299KB)
❌ **Too Large for CI**  
**用途：** 真实场景测试、猫眼电影网站代码、中等规模性能测试

### sample-03-pdd (269KB)
❌ **Too Large for CI**  
**用途：** 企业级验证、拼多多电商代码、Anti-tampering 测试

### sample-04-gk (642KB)
❌ **Stress Test Only**  
**用途：** 压力测试、最大样本、Hex 编码、内存管理

### sample-05-cx (41KB)
✅ **CI/CD**  
**用途：** 快速回归测试、标准混淆模式、CI集成

---

## 🔒 安全措施

### ✅ 已实施

- 来源验证（公开 GitHub 仓库）
- 许可证检查（MIT）
- 文件隔离（独立 fixtures 目录）
- 文档说明（README + 警告）
- 代码审查（无明显恶意代码）

### ❌ 禁止

- 直接执行（eval, Function）
- 生产环境使用
- 浏览器加载
- 修改样本内容

### ✅ 允许

- 沙箱分析（vm.createContext）
- AST 解析
- 性能测试
- 算法验证

---

## 📂 文件列表

```
test/fixtures/real-samples/
├── README.md                      # 完整使用说明
├── COLLECTION-REPORT.md          # 详细收集报告
├── SAMPLE-LIST.md                # 本文件
├── samples-index.json            # JSON 索引
├── validate-samples.ts           # 验证脚本
├── download-samples.ps1          # 下载脚本
│
├── sample-01-obfuscator/         # 15 KB
│   ├── input.js
│   ├── expected.js
│   └── metadata.json
│
├── sample-02-maoyan/             # 299 KB
│   ├── input.js
│   ├── expected.js
│   └── metadata.json
│
├── sample-03-pdd/                # 269 KB
│   ├── input.js
│   ├── expected.js
│   └── metadata.json
│
├── sample-04-gk/                 # 642 KB
│   ├── input.js
│   ├── expected.js
│   └── metadata.json
│
└── sample-05-cx/                 # 41 KB
    ├── input.js
    ├── expected.js
    └── metadata.json
```

**总文件数：** 23  
**总大小：** ~1.3 MB

---

## ✅ 验收检查

- [x] 至少 5 个不同类型样本
- [x] 来自公开可信来源
- [x] 每个样本包含 input.js
- [x] 每个样本包含 expected.js
- [x] 每个样本有 metadata.json
- [x] 记录来源 URL
- [x] 记录混淆类型
- [x] 记录文件大小
- [x] 记录测试目标
- [x] 不直接执行代码
- [x] 不混入正式代码
- [x] 明确安全警告
- [x] 完整文档说明

---

## 🚀 快速开始

### 验证样本

```bash
cd test/fixtures/real-samples
npx tsx validate-samples.ts
```

### 查看样本信息

```bash
# 查看所有样本
cat samples-index.json | jq '.samples[] | {name, type, size}'

# 查看单个样本
cat sample-01-obfuscator/metadata.json | jq
```

### 测试样本（示例）

```typescript
import { recover } from '../../../src/core/pipeline.js';
import { readFileSync } from 'fs';

// 读取样本
const input = readFileSync(
  './sample-01-obfuscator/input.js', 
  'utf-8'
);

// 还原
const result = await recover(input, { 
  useSandbox: true,
  timeout: 5000 
});

console.log(result.code);
```

---

**生成时间：** 2026-11-08  
**验证状态：** ✅ 通过  
**下一步：** 可以开始第二阶段真实样本测试
