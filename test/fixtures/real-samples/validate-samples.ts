/**
 * 验证所有样本文件完整性
 */
import { existsSync, statSync, readFileSync } from 'fs';
import { join } from 'path';

const samplesDir = './';
const index = JSON.parse(readFileSync('./samples-index.json', 'utf-8'));

console.log('🔍 Validating OB-Recover Real Samples\n');

let errors = 0;
let warnings = 0;

// 验证每个样本
for (const sample of index.samples) {
  const dir = join(samplesDir, sample.name);
  console.log(`📦 ${sample.name}`);
  
  // 检查目录
  if (!existsSync(dir)) {
    console.error(`  ❌ Directory not found`);
    errors++;
    continue;
  }
  
  // 检查 input.js
  const inputPath = join(dir, 'input.js');
  if (!existsSync(inputPath)) {
    console.error(`  ❌ input.js missing`);
    errors++;
  } else {
    const inputSize = statSync(inputPath).size;
    const expectedSize = sample.size.input;
    const diff = Math.abs(inputSize - expectedSize);
    const diffPercent = (diff / expectedSize) * 100;
    
    if (diffPercent > 5) {
      console.warn(`  ⚠️  input.js size mismatch: ${inputSize} (expected ${expectedSize})`);
      warnings++;
    } else {
      console.log(`  ✅ input.js: ${inputSize} bytes`);
    }
  }
  
  // 检查 expected.js
  const expectedPath = join(dir, 'expected.js');
  if (!existsSync(expectedPath)) {
    console.warn(`  ⚠️  expected.js missing (optional)`);
    warnings++;
  } else {
    const expectedSize = statSync(expectedPath).size;
    console.log(`  ✅ expected.js: ${expectedSize} bytes`);
  }
  
  // 检查 metadata.json
  const metadataPath = join(dir, 'metadata.json');
  if (!existsSync(metadataPath)) {
    console.warn(`  ⚠️  metadata.json missing`);
    warnings++;
  } else {
    try {
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
      if (!metadata.name || !metadata.source) {
        console.warn(`  ⚠️  metadata.json incomplete`);
        warnings++;
      } else {
        console.log(`  ✅ metadata.json valid`);
      }
    } catch (e) {
      console.error(`  ❌ metadata.json invalid JSON`);
      errors++;
    }
  }
  
  console.log('');
}

// 总结
console.log('━'.repeat(50));
console.log(`📊 Validation Summary`);
console.log(`   Total Samples: ${index.samples.length}`);
console.log(`   ✅ Passed: ${index.samples.length - errors}`);
console.log(`   ❌ Errors: ${errors}`);
console.log(`   ⚠️  Warnings: ${warnings}`);
console.log('━'.repeat(50));

if (errors > 0) {
  console.error('\n❌ Validation failed. Please fix the errors above.');
  process.exit(1);
} else if (warnings > 0) {
  console.warn('\n⚠️  Validation passed with warnings.');
  process.exit(0);
} else {
  console.log('\n✅ All samples validated successfully!');
  process.exit(0);
}
