/**
 * 命令行开发工具：node --import tsx scripts/cli.ts <input.js> [output.js]
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'vm';
import { recover } from '../src/core/pipeline.js';
import { createNodeSandboxContext } from '../src/core/sandbox-context.js';

const [,, inputPath, outputPath] = process.argv;

if (!inputPath) {
  console.error('Usage: tsx scripts/cli.ts <input.js> [output.js]');
  process.exit(1);
}

const code = readFileSync(resolve(inputPath), 'utf-8');

async function nodeSandboxEval(evalCode: string): Promise<unknown> {
  const ctx = vm.createContext(createNodeSandboxContext());
  return vm.runInContext(evalCode, ctx, { timeout: 10000 });
}

(async () => {
  console.log(`Processing: ${inputPath} (${code.length} chars)`);
  const t0 = performance.now();

  const result = await recover(code, {
    useSandbox: true,
    sandboxEval: nodeSandboxEval,
  });

  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

  console.log(`\nDecoders found: ${result.decoders.length}`);
  for (const d of result.decoders) {
    console.log(`  - ${d.name} (array: ${d.arrayName}, algo: ${d.algorithm})`);
  }

  console.log(`\nMappings: ${Object.keys(result.mappings).length}`);
  console.log(`Transforms: ${result.transforms.length}`);
  console.log(`Resolved: ${result.stats.resolvedCalls} / ${result.stats.totalCalls}`);
  console.log(`Skipped: ${result.stats.skippedCalls}`);
  console.log(`Time: ${elapsed}s`);

  const out = outputPath || inputPath.replace(/\.js$/, '.recovered.js');
  writeFileSync(resolve(out), result.code, 'utf-8');
  console.log(`\nOutput: ${out}`);

  // 转换报告
  if (result.transforms.length > 0) {
    console.log('\n=== Transform Report (first 20) ===');
    for (const t of result.transforms.slice(0, 20)) {
      console.log(`  L${t.line}:${t.column}  ${t.original}  →  ${t.replaced}`);
    }
    if (result.transforms.length > 20) {
      console.log(`  ... and ${result.transforms.length - 20} more`);
    }
  }
})();
