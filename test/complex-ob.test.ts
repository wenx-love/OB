import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { recover } from '../src/core/pipeline.js';
import { createNodeSandboxContext } from '../src/core/sandbox-context.js';
import vm from 'vm';

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

async function nodeSandboxEval(code: string): Promise<unknown> {
  const ctx = vm.createContext(createNodeSandboxContext());
  return vm.runInContext(code, ctx, { timeout: 5000 });
}

describe('complex OB recovery + semantic preservation', () => {
  it('should fully recover complex-ob.js', async () => {
    const code = fixture('complex-ob.js');
    const result = await recover(code, {
      useSandbox: true,
      sandboxEval: nodeSandboxEval,
      enableObjectMapping: true,
    });

    // 1. 字符串解码
    expect(result.decoders).toHaveLength(1);
    expect(result.code).not.toContain('_0xdec(');

    // 2. 代理函数内联
    expect(result.code).not.toContain('_0xadd(');
    expect(result.code).not.toContain('_0xeq(');

    // 3. 控制流还原
    expect(result.code).not.toContain('switch');
    expect(result.code).not.toContain("'split'");

    // 4. 死代码删除
    expect(result.code).not.toContain('dead code');
    expect(result.code).not.toContain('unreachable');

    // 5. 布尔还原
    expect(result.code).not.toContain('!![]');

    // 6. computed→static
    expect(result.code).toContain('.sign');
    expect(result.code).toContain('.user');
    expect(result.code).toContain('.token');
    expect(result.code).toContain('.encrypt');
    expect(result.code).toContain('JSON.stringify');

    // 7. 解码器基础设施删除
    expect(result.code).not.toContain('_0xarr');
    expect(result.code).not.toContain('function _0xdec');
    expect(result.code).not.toContain('atob');

    // 8. 语义保持：关键逻辑存在
    expect(result.code).toContain('processUser');
    expect(result.code).toContain('admin');
    expect(result.code).toContain('abc123');
    expect(result.code).toContain('/api/sign');

    // 9. 语义保持：还原后代码可执行
    const ctx = vm.createContext({ JSON, console: { log() {} } });
    expect(() => vm.runInContext(result.code, ctx, { timeout: 3000 })).not.toThrow();

    // 10. 多轮迭代
    expect(result.stats.passes).toBeGreaterThanOrEqual(2);

    console.log(`Transforms: ${result.transforms.length}, Passes: ${result.stats.passes}`);
  });
});
