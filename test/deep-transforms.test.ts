import { describe, it, expect } from 'vitest';
import { parse } from '@babel/parser';
import _generate from '@babel/generator';
const generate = (typeof _generate === 'function' ? _generate : (_generate as any).default) as typeof _generate;

import {
  controlFlowRecovery,
  deadCodeRemoval,
  booleanRestore,
  constantFolding,
  hexNumericRestore,
  identifierRename,
} from '../src/core/transforms/index.js';

function apply(code: string, fn: (ast: any) => any): { code: string; result: any } {
  const ast = parse(code, { sourceType: 'unambiguous' });
  const result = fn(ast);
  const output = generate(ast, { compact: false });
  return { code: output.code, result };
}

describe('deep-transforms', () => {
  describe('controlFlowRecovery', () => {
    it('should reorder switch/while pattern', () => {
      const code = `
        var _0xa = "1|0|2".split("|");
        var _0xi = 0;
        while (true) {
          switch (_0xa[_0xi++]) {
            case "0":
              console.log("second");
              continue;
            case "1":
              console.log("first");
              continue;
            case "2":
              console.log("third");
              continue;
          }
          break;
        }
      `;
      const { code: output, result } = apply(code, controlFlowRecovery);
      expect(result.count).toBe(1);
      const firstIdx = output.indexOf('"first"');
      const secondIdx = output.indexOf('"second"');
      const thirdIdx = output.indexOf('"third"');
      expect(firstIdx).toBeGreaterThanOrEqual(0);
      expect(secondIdx).toBeGreaterThanOrEqual(0);
      expect(thirdIdx).toBeGreaterThanOrEqual(0);
      expect(firstIdx).toBeLessThan(secondIdx);
      expect(secondIdx).toBeLessThan(thirdIdx);
      expect(output).not.toContain('split');
    });
  });

  describe('deadCodeRemoval', () => {
    it('should remove if(false) blocks', () => {
      const code = `if (false) { console.log("dead"); }`;
      const { code: output, result } = apply(code, deadCodeRemoval);
      expect(result.count).toBe(1);
      expect(output).not.toContain('dead');
    });

    it('should simplify if(true) to consequent', () => {
      const code = `if (true) { console.log("alive"); } else { console.log("dead"); }`;
      const { code: output, result } = apply(code, deadCodeRemoval);
      expect(result.count).toBe(1);
      expect(output).toContain('"alive"');
      expect(output).not.toContain('"dead"');
    });

    it('should remove while(false) blocks', () => {
      const code = `while (false) { console.log("never"); }`;
      const { code: output, result } = apply(code, deadCodeRemoval);
      expect(result.count).toBe(1);
      expect(output).not.toContain('never');
    });
  });

  describe('booleanRestore', () => {
    it('should restore !0 to true and !1 to false', () => {
      const code = `var a = !0; var b = !1;`;
      const { code: output, result } = apply(code, booleanRestore);
      expect(result.count).toBe(2);
      expect(output).toContain('true');
      expect(output).toContain('false');
      expect(output).not.toContain('!0');
      expect(output).not.toContain('!1');
    });

    it('should restore !![] to true', () => {
      const code = `var a = !![];`;
      const { code: output, result } = apply(code, booleanRestore);
      expect(result.count).toBe(1);
      expect(output).toContain('true');
    });
  });

  describe('constantFolding', () => {
    it('should fold string concatenation', () => {
      const code = `var x = "a" + "b";`;
      const { code: output, result } = apply(code, constantFolding);
      expect(result.count).toBe(1);
      expect(output).toContain('"ab"');
    });

    it('should fold numeric addition', () => {
      const code = `var x = 1 + 2;`;
      const { code: output, result } = apply(code, constantFolding);
      expect(result.count).toBe(1);
      expect(output).toContain('3');
    });
  });

  describe('hexNumericRestore', () => {
    it('should convert hex literals to decimal', () => {
      const code = `var x = 0x1a4;`;
      const { code: output, result } = apply(code, hexNumericRestore);
      expect(result.count).toBe(1);
      expect(output).toContain('420');
      expect(output).not.toContain('0x1a4');
    });
  });

  describe('identifierRename', () => {
    it('should rename _0x identifiers to readable names', () => {
      const code = `
        function _0xabcdef(x) { return x; }
        var _0xef0123 = 42;
      `;
      const { code: output, result } = apply(code, identifierRename);
      expect(result.count).toBeGreaterThanOrEqual(2);
      expect(output).toContain('func1');
      expect(output).toContain('v1');
      expect(output).not.toContain('_0xabcdef');
      expect(output).not.toContain('_0xef0123');
    });
  });
});
