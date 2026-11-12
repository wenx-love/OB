import { describe, it, expect, beforeAll } from 'vitest';

// Phase 4.6.1: scripts/analyze-real-ob-e2e.ts 缺少 await 的静态守卫。
// 修复前第 46、52 行调用 async 的 dryRunReplacements 没有 await：拿到的是 Promise，脚本在分析完成前就抛出 TypeError（退出码 1）。
// 这只是静态检查：它证明现在每个调用点都有 await，不证明脚本的分析结果正确。
// 运行层面的证据是修复前后各运行一次脚本的输出（退出码、输出 JSON 是否刷新、候选数和 oracle 对照）。
// 带负向对照：没有 await 的合成源码必须被判为未等待。

const FS_MODULE: string = 'node:fs';
const URL_MODULE: string = 'node:url';
interface FsLike { readFileSync(path: string, encoding: string): string }
interface UrlLike { fileURLToPath(url: URL): string }

function callsOf(source: string, fn: string): { total: number; unawaited: number } {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const re = new RegExp('\\b' + fn + '\\s*\\(', 'g');
  let total = 0;
  let unawaited = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    total++;
    if (!/\bawait\s+$/.test(code.slice(0, m.index))) unawaited++;
  }
  return { total, unawaited };
}

describe('analyze-real-ob-e2e.ts 等待完整的异步分析流程', () => {
  let source = '';

  beforeAll(async () => {
    const fs: FsLike = await import(/* @vite-ignore */ FS_MODULE);
    const url: UrlLike = await import(/* @vite-ignore */ URL_MODULE);
    source = fs.readFileSync(url.fileURLToPath(new URL('../scripts/analyze-real-ob-e2e.ts', import.meta.url)), 'utf8');
  });

  it('dryRunReplacements 的每个调用点都有 await（修复前 2 个没有）', () => {
    const r = callsOf(source, 'dryRunReplacements');
    expect(r.total).toBe(2);
    expect(r.unawaited).toBe(0);
  });

  it('负向对照：没有 await 的调用会被判为未等待，有 await 的不会', () => {
    expect(callsOf('const a = dryRunReplacements(r, s);', 'dryRunReplacements')).toEqual({ total: 1, unawaited: 1 });
    expect(callsOf('const a = await dryRunReplacements(r, s);', 'dryRunReplacements')).toEqual({ total: 1, unawaited: 0 });
    expect(callsOf('// dryRunReplacements(r, s) 只出现在注释里', 'dryRunReplacements')).toEqual({ total: 0, unawaited: 0 });
  });
});
