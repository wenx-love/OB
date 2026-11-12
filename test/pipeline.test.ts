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

describe('recover pipeline', () => {
  it('Phase 1: should decode string array calls', async () => {
    const code = fixture('simple-string-array.js');
    const result = await recover(code, {
      useSandbox: true,
      sandboxEval: nodeSandboxEval,
    });

    expect(result.decoders).toHaveLength(1);
    expect(result.stats.resolvedCalls).toBeGreaterThan(0);
    expect(result.stats.passes).toBeGreaterThanOrEqual(1);
    expect(result.code).toContain('console.log');
    expect(result.code).not.toContain('console["log"]');
  });

  it('Phase 2: should handle member expressions on pre-decoded code', async () => {
    const code = fixture('member-expression.js');
    const result = await recover(code, {
      useSandbox: false,
      enableObjectMapping: true,
    });

    expect(result.code).toContain('console.log("hello")');
    expect(result.code).toContain('Math.floor(3.14)');
    expect(result.code).toContain('JSON.stringify(');
    expect(result.code).toContain('Object.keys(');
    expect(result.code).toContain('1 + 2');
    expect(result.code).toContain('10 - 3');
    expect(result.code).toContain('"a" === "a"');
    expect(result.code).toContain('console[prop]');
    expect(result.objectMappings.length).toBeGreaterThan(0);
    expect(result.stats.passes).toBeGreaterThanOrEqual(1);
  });

  it('should converge in multiple passes (constant fold → dead code)', async () => {
    // Pass 1: "a" + "b" folds to "ab", then "ab" === "ab" folds to true
    // Pass 2: if(true) removes dead else branch
    const code = 'if ("a" + "b" === "ab") { good(); } else { bad(); }';
    const result = await recover(code, { useSandbox: false });

    expect(result.code).toContain('good()');
    expect(result.code).not.toContain('bad()');
    expect(result.stats.passes).toBeGreaterThanOrEqual(2);
  });
});
