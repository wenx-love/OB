import { readFileSync, writeFileSync } from 'fs';

// 正确的位置映射 (从源码 → 正确位置)
const corrections: Record<string, { callName: string; positions: Array<{ column: number; start: number; end: number }> }> = {
  "var _arr = ['hello']; function dec(i) { return _arr[i]; } dec(0);": {
    callName: 'dec',
    positions: [{ column: 58, start: 58, end: 64 }],
  },
  "var _arr = ['a', 'b']; function dec(i) { return _arr[i]; } dec(0); dec(1);": {
    callName: 'dec',
    positions: [
      { column: 59, start: 59, end: 65 },
      { column: 67, start: 67, end: 73 },
    ],
  },
  "var _arr = ['a', 'b']; function dec(i) { return _arr[i]; } function enc(i) { return _arr[i]; } dec(0); enc(1);": {
    callName: 'dec/enc',
    positions: [
      { column: 95, start: 95, end: 101 },
      { column: 103, start: 103, end: 109 },
    ],
  },
  "var _arr = [\"a'b\", 'c\"d']; function dec(i) { return _arr[i]; } dec(0); dec(1);": {
    callName: 'dec',
    positions: [
      { column: 63, start: 63, end: 69 },
      { column: 71, start: 71, end: 77 },
    ],
  },
  "var _arr = [null]; function dec(i) { return _arr[i]; } dec(0);": {
    callName: 'dec',
    positions: [{ column: 55, start: 55, end: 61 }],
  },
  "var _arr = [42, 3.14]; function dec(i) { return _arr[i]; } dec(0); dec(1);": {
    callName: 'dec',
    positions: [
      { column: 59, start: 59, end: 65 },
      { column: 67, start: 67, end: 73 },
    ],
  },
  "var _arr = [true, false]; function dec(i) { return _arr[i]; } dec(0); dec(1);": {
    callName: 'dec',
    positions: [
      { column: 62, start: 62, end: 68 },
      { column: 70, start: 70, end: 76 },
    ],
  },
  "var _arr = ['你好', 'a\\\\nb']; function dec(i) { return _arr[i]; } dec(0); dec(1);": {
    callName: 'dec',
    positions: [
      { column: 63, start: 63, end: 69 },
      { column: 71, start: 71, end: 77 },
    ],
  },
};

const file = 'test/verified-replacer.test.ts';
let content = readFileSync(file, 'utf8');

// 针对每个源码，进行修正
for (const [sourcePattern, correction] of Object.entries(corrections)) {
  // 查找所有匹配该源码的测试块
  const sourceRegex = new RegExp(`const source = \`${sourcePattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\`;`, 'g');
  
  let match;
  const matches: number[] = [];
  while ((match = sourceRegex.exec(content)) !== null) {
    matches.push(match.index);
  }
  
  console.log(`Found ${matches.length} occurrences of: ${sourcePattern.slice(0, 50)}...`);
  
  // 对于每个匹配，向后查找其候选位置并修正
  for (const matchIndex of matches.reverse()) {  // 从后往前修正，避免偏移
    const afterSource = content.slice(matchIndex);
    const endOfTest = afterSource.indexOf('\n  });');  // 找到测试结束
    if (endOfTest === -1) continue;
    
    const testBlock = afterSource.slice(0, endOfTest);
    
    // 修正每个候选位置
    correction.positions.forEach((pos, idx) => {
      const positionRegex = /position: \{ lineNumber: 0, columnNumber: (\d+) \},?\s+start: (\d+),?\s+end: (\d+),?/g;
      let posMatch;
      let posIndex = 0;
      
      while ((posMatch = positionRegex.exec(testBlock)) !== null) {
        if (posIndex === idx) {
          const oldColumn = parseInt(posMatch[1]);
          const oldStart = parseInt(posMatch[2]);
          const oldEnd = parseInt(posMatch[3]);
          
          if (oldColumn !== pos.column || oldStart !== pos.start || oldEnd !== pos.end) {
            console.log(`  Correcting candidate ${idx}: column ${oldColumn}→${pos.column}, start ${oldStart}→${pos.start}, end ${oldEnd}→${pos.end}`);
            
            const fullMatch = posMatch[0];
            const replacement = `position: { lineNumber: 0, columnNumber: ${pos.column} },\n          start: ${pos.start},\n          end: ${pos.end},`;
            
            const globalIndex = matchIndex + posMatch.index;
            content = content.slice(0, globalIndex) + replacement + content.slice(globalIndex + fullMatch.length);
          }
          break;
        }
        posIndex++;
      }
    });
  }
}

writeFileSync(file, content, 'utf8');
console.log('\nDone!');
