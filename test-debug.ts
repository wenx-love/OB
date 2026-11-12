import { applyVerifiedReplacements } from './src/core/verified-replacer.js';
import type { DryRunResult } from './src/core/replacement-dryrun.js';
import type { ValidationScript } from './src/core/capture-validation.js';
import { computeScriptHash } from './src/core/hash-utils.js';

async function main() {
  const source = `var _arr = ['hello']; function dec(i) { return _arr[i]; } dec(0);`;
  const script: ValidationScript = {
    scriptId: 's1',
    url: 'test.js',
    source,
    startLine: 0,
    startColumn: 0,
  };

  const scriptHash = await computeScriptHash(source);

  const dryRunResult: DryRunResult = {
    candidates: [
      {
        scriptId: 's1',
        scriptHash,
        groupId: 'g1',
        position: { lineNumber: 0, columnNumber: 59 },
        start: 59, // dec(0) 的起始位置
        end: 65,   // dec(0) 的结束位置
        callText: 'dec(0)',
        value: 'hello',
        status: 'verified',
        callLocationsTruncated: false,
        reasons: [],
      },
    ],
    rejections: {},
    summary: { verified: 1, rejected: 0 },
  };

  console.log('Source:', source);
  console.log('Position:', dryRunResult.candidates[0].position);
  console.log('Start/End:', dryRunResult.candidates[0].start, dryRunResult.candidates[0].end);

  const result = await applyVerifiedReplacements(dryRunResult, script);

  console.log('\nResult:');
  console.log('Applied:', result.applied.length);
  console.log('Rejected:', result.rejected.length);
  if (result.rejected.length > 0) {
    console.log('Rejection reasons:', JSON.stringify(result.rejected, null, 2));
  }
  console.log('Code:', result.code);
}

main().catch(console.error);
