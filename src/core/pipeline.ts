import type { RecoverOptions, RecoverResult } from '../types/index.js';
import { parseCode } from './parser.js';
import { detectDecoders, buildDecoderMappings } from './string-decoder.js';
import { transformCalls } from './call-transformer.js';
import { transformComputedToStatic, inlineProxyFunctions, inferObjectMappings, applyObjectMappings } from './member-transformer.js';
import {
  deadCodeRemoval,
  booleanRestore,
  constantFolding,
  hexNumericRestore,
  controlFlowRecovery,
  deadDecoderRemoval,
  identifierRename,
} from './transforms/index.js';
import { MappingManager } from './mapping.js';
import { generateCode } from './generator.js';

const MAX_PASSES = 10;

/**
 * OB-Recover 主入口。
 *
 * Phase 1 — 字符串解码（一次）
 *   parse → detectDecoders → buildMappings → transformCalls
 *
 * Phase 2 — 多轮迭代还原（最多 MAX_PASSES 轮，直到收敛）
 *   deadCodeRemoval → booleanRestore → constantFolding → hexNumericRestore
 *   → controlFlowRecovery → inlineProxyFunctions → inferObjectMappings
 *   → transformComputedToStatic
 *
 * Phase 3 — 收尾（一次）
 *   deadDecoderRemoval → identifierRename
 *
 * Final — 代码生成
 */
export async function recover(
  code: string,
  options: RecoverOptions = {},
): Promise<RecoverResult> {
  const t0 = performance.now();
  const manager = new MappingManager();
  const allTransforms: RecoverResult['transforms'] = [];

  if (options.externalMappings) {
    manager.import(options.externalMappings);
  }

  // === Phase 1: 字符串解码 ===

  const ast = parseCode(code);
  const decoders = detectDecoders(ast, code);

  if (options.useSandbox !== false) {
    for (const decoder of decoders) {
      const decoderMappings = await buildDecoderMappings(decoder, ast, code, options);
      manager.import(decoderMappings);
    }
  }

  const callResult = transformCalls(ast, code, decoders, manager.export());
  allTransforms.push(...callResult.transforms);

  // === Phase 2: 多轮迭代还原 ===

  let passes = 0;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let passCount = 0;

    const dcr = deadCodeRemoval(ast);
    allTransforms.push(...dcr.transforms);
    passCount += dcr.count;

    const br = booleanRestore(ast);
    allTransforms.push(...br.transforms);
    passCount += br.count;

    const cf = constantFolding(ast);
    allTransforms.push(...cf.transforms);
    passCount += cf.count;

    const hnr = hexNumericRestore(ast);
    allTransforms.push(...hnr.transforms);
    passCount += hnr.count;

    const cfr = controlFlowRecovery(ast);
    allTransforms.push(...cfr.transforms);
    passCount += cfr.count;

    const proxy = inlineProxyFunctions(ast);
    allTransforms.push(...proxy.transforms);
    passCount += proxy.count;

    if (options.enableObjectMapping) {
      inferObjectMappings(ast, manager);
      const objReplace = applyObjectMappings(ast, manager);
      allTransforms.push(...objReplace.transforms);
      passCount += objReplace.count;
    }

    const member = transformComputedToStatic(ast);
    allTransforms.push(...member.transforms);
    passCount += member.count;

    passes++;
    if (passCount === 0) break; // 收敛
  }

  // === Phase 3: 收尾（只跑一次）===

  const ddr = deadDecoderRemoval(ast, decoders);
  allTransforms.push(...ddr.transforms);

  const ir = identifierRename(ast);
  allTransforms.push(...ir.transforms);

  // === Final: 代码生成 ===

  const outputCode = generateCode(ast);

  return {
    code: outputCode,
    transforms: allTransforms,
    mappings: manager.export(),
    objectMappings: manager.exportObjects(),
    decoders,
    stats: {
      totalCalls: callResult.resolved + callResult.skipped,
      resolvedCalls: allTransforms.length,
      skippedCalls: callResult.skipped,
      timeTaken: performance.now() - t0,
      passes,
    },
  };
}

export { parseCode } from './parser.js';
export { detectDecoders, buildDecoderMappings } from './string-decoder.js';
export { analyzeCallDeterminism, isStaticValue, safeStaticEval, tryStaticEval, resolveStaticBinding, analyzeFunctionPurity } from './deterministic.js';
export { transformCalls } from './call-transformer.js';
export { transformComputedToStatic, inlineProxyFunctions, inferObjectMappings, applyObjectMappings } from './member-transformer.js';
export { MappingManager } from './mapping.js';
export { generateCode } from './generator.js';
export { createNodeSandboxContext } from './sandbox-context.js';
export {
  deadCodeRemoval,
  booleanRestore,
  constantFolding,
  hexNumericRestore,
  controlFlowRecovery,
  deadDecoderRemoval,
  identifierRename,
} from './transforms/index.js';
export type * from '../types/index.js';
