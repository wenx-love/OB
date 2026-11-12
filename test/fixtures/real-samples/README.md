# OB-Recover Real Samples Collection

本目录包含从公开 GitHub 仓库收集的**真实 JavaScript 混淆样本**，用于 OB-Recover 第二阶段验收测试。

## ⚠️ 安全声明

- ✅ 所有样本均来自公开 GitHub 仓库
- ✅ 仅用于测试目的，不直接执行
- ✅ 所有样本已经过来源验证
- ⚠️ **禁止**在生产环境中使用这些样本
- ⚠️ **禁止**直接执行未知代码

## 📊 样本概览

| 样本 | 来源 | 类型 | 大小 | 特性 |
|------|------|------|------|------|
| sample-01-obfuscator | js-deobfuscator | javascript-obfuscator | 15KB | 标准混淆 + Base64 |
| sample-02-maoyan | js-deobfuscator | 商业混淆 | 299KB | 猫眼电影真实代码 |
| sample-03-pdd | js-deobfuscator | 企业级混淆 | 269KB | 拼多多真实代码 |
| sample-04-gk | js-deobfuscator | 重度混淆 + Hex | 642KB | 最大样本（性能测试）|
| sample-05-cx | js-deobfuscator | 标准商业混淆 | 41KB | 快速验证 |

**总计：** 5 个样本，1.27 MB 混淆代码

## 📁 目录结构

每个样本包含：

```
sample-XX-name/
  ├── input.js        # 原始混淆代码（不可执行）
  ├── expected.js     # 预期还原结果（参考）
  └── metadata.json   # 样本元数据
```

### metadata.json 结构

```json
{
  "name": "样本名称",
  "source": "GitHub 源链接",
  "description": "样本描述",
  "obfuscationType": "混淆类型",
  "features": ["特性列表"],
  "inputSize": 12345,
  "expectedSize": 6789,
  "testGoal": "测试目标",
  "hasExpectedOutput": true,
  "performance": {
    "targetParseTime": "<500ms",
    "targetRecoveryTime": "<5000ms"
  },
  "notes": "额外说明"
}
```

## 🎯 样本用途

### 1. sample-01-obfuscator (15KB)
**用途：** 基准测试
- 验证 javascript-obfuscator 标准输出
- Base64 字符串解码
- 数组旋转
- 控制流扁平化
- Anti-debug 移除

### 2. sample-02-maoyan (299KB)
**用途：** 真实场景测试
- 猫眼电影网站真实生产代码
- 大型字符串数组
- 复杂控制流
- 性能验证（中等规模）

### 3. sample-03-pdd (269KB)
**用途：** 企业级验证
- 拼多多电商平台代码
- 企业级混淆模式
- Anti-tampering 保护
- 多层解码器

### 4. sample-04-gk (642KB)
**用途：** 压力测试
- 最大样本（0.6MB）
- Hex 编码标识符
- 性能极限测试
- 内存管理验证

### 5. sample-05-cx (41KB)
**用途：** 快速验证
- CI/CD 集成测试
- 快速回归测试
- 标准混淆模式验证

## 🔍 来源

所有样本来自：[kuizuo/js-deobfuscator](https://github.com/kuizuo/js-deobfuscator)

**仓库信息：**
- ⭐ Stars: 1.2k
- 📜 License: MIT
- 📅 Last Update: 2024
- 🔨 Maintained: Yes

### 样本特点

- ✅ 真实生产代码（非人工构造）
- ✅ 多种混淆类型覆盖
- ✅ 包含标准还原输出
- ✅ 规模从 15KB 到 642KB
- ✅ MIT 开源许可

## 🧪 使用方法

### 基本测试

```typescript
import { recover } from '../../../src/core/pipeline.js';
import { readFileSync } from 'fs';

const input = readFileSync('./sample-01-obfuscator/input.js', 'utf-8');
const result = await recover(input, { useSandbox: true });
console.log(result.code);
```

### 性能测试

```typescript
const start = performance.now();
const result = await recover(input, { useSandbox: true });
const duration = performance.now() - start;

console.log(`Recovery time: ${duration.toFixed(2)}ms`);
```

### 对比测试

```typescript
const expected = readFileSync('./sample-01-obfuscator/expected.js', 'utf-8');
const result = await recover(input, { useSandbox: true });

// 注意：不要直接比较字符串相等
// expected.js 是参考输出，不是唯一正确答案
// 应该比较语义等价性
```

## ⚠️ 重要注意事项

### 安全规则

1. **禁止直接执行**
   - ❌ 不要 `eval(input)` 或 `Function(input)()`
   - ❌ 不要在浏览器中直接加载
   - ✅ 只在沙箱中分析

2. **沙箱隔离**
   ```typescript
   import vm from 'vm';
   const sandbox = vm.createContext({ /* limited scope */ });
   vm.runInContext(code, sandbox, { timeout: 5000 });
   ```

3. **超时保护**
   - 所有执行必须设置超时（推荐 5 秒）
   - 防止无限循环

4. **内存限制**
   - 监控内存使用
   - 大文件（>500KB）要特别注意

### 测试限制

1. **expected.js 不是唯一答案**
   - 只是一种有效的还原结果
   - OB-Recover 的输出可能不同但同样正确
   - 应该比较功能而非字符串

2. **性能目标是参考值**
   - 实际性能取决于硬件
   - CI/CD 环境可能更慢

3. **不要修改样本**
   - 保持原样用于可重复测试
   - 如需变体，创建新样本

## 📈 预期测试结果

### 功能验证

- ✅ 所有样本应该成功解析（无 SyntaxError）
- ✅ 字符串解码应该正确（至少部分）
- ✅ 不应该崩溃或超时
- ⚠️ 完整还原不是必需的（复杂混淆可能只部分还原）

### 性能目标

| 样本 | 解析时间 | 还原时间 | 总时间 |
|------|----------|----------|--------|
| sample-01 | <100ms | <1s | <1.5s |
| sample-02 | <500ms | <5s | <6s |
| sample-03 | <500ms | <5s | <6s |
| sample-04 | <1s | <10s | <12s |
| sample-05 | <200ms | <2s | <3s |

## 🔄 更新样本

如需更新样本：

```powershell
# 重新下载所有样本
.\download-samples.ps1

# 或手动下载单个样本
curl -o sample-XX/input.js https://raw.githubusercontent.com/kuizuo/js-deobfuscator/main/example/XXX/input.js
```

## 📝 引用

如果在论文或报告中使用这些样本，请引用原始来源：

```
@misc{js-deobfuscator,
  author = {kuizuo},
  title = {js-deobfuscator: An automated JavaScript deobfuscation tool},
  year = {2024},
  publisher = {GitHub},
  url = {https://github.com/kuizuo/js-deobfuscator}
}
```

## 📧 问题反馈

如果发现样本问题或需要更多样本类型：
- 提 Issue 到 OB-Recover 仓库
- 说明需要的混淆类型和特性

---

**最后更新：** 2026-11-08  
**版本：** 1.0  
**样本总数：** 5
