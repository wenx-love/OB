import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseCode } from '../src/core/parser.js';
import {
  transformComputedToStatic,
  inlineProxyFunctions,
  inferObjectMappings,
} from '../src/core/member-transformer.js';
import { MappingManager } from '../src/core/mapping.js';
import { generateCode } from '../src/core/generator.js';

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

describe('transformComputedToStatic', () => {
  it('should convert obj["prop"] to obj.prop for valid identifiers', () => {
    const code = 'console["log"]("hello"); Math["floor"](3.14);';
    const ast = parseCode(code);
    const { count } = transformComputedToStatic(ast);
    const output = generateCode(ast);

    expect(count).toBe(2);
    expect(output).toContain('console.log("hello")');
    expect(output).toContain('Math.floor(3.14)');
  });

  it('should NOT convert when property is a reserved word', () => {
    const code = 'obj["delete"](x);';
    const ast = parseCode(code);
    const { count } = transformComputedToStatic(ast);
    const output = generateCode(ast);

    expect(count).toBe(0);
    expect(output).toContain('["delete"]');
  });

  it('should NOT convert when property has invalid chars', () => {
    const code = 'obj["my-prop"](x); obj["123start"](y);';
    const ast = parseCode(code);
    const { count } = transformComputedToStatic(ast);

    expect(count).toBe(0);
  });

  it('should NOT convert when property is a variable', () => {
    const code = 'var p = "log"; console[p]("test");';
    const ast = parseCode(code);
    const { count } = transformComputedToStatic(ast);

    expect(count).toBe(0); // p is not a StringLiteral
  });
});

describe('inlineProxyFunctions', () => {
  it('should inline binary proxy functions', () => {
    const code = `
      var _0xAdd = function(a, b) { return a + b; };
      var r = _0xAdd(1, 2);
    `;
    const ast = parseCode(code);
    const { count } = inlineProxyFunctions(ast);
    const output = generateCode(ast);

    expect(count).toBeGreaterThanOrEqual(1); // 1 inline + possibly 1 dead removal
    expect(output).toContain('1 + 2');
    expect(output).not.toContain('_0xAdd(1, 2)');
  });

  it('should inline comparison proxy', () => {
    const code = `
      var _0xEq = function(a, b) { return a === b; };
      var r = _0xEq("a", "b");
    `;
    const ast = parseCode(code);
    const { count } = inlineProxyFunctions(ast);
    const output = generateCode(ast);

    expect(count).toBeGreaterThanOrEqual(1); // 1 inline + possibly 1 dead removal
    expect(output).toContain('"a" === "b"');
  });

  it('should NOT inline functions with multiple statements', () => {
    const code = `
      var fn = function(a, b) { console.log(a); return a + b; };
      var r = fn(1, 2);
    `;
    const ast = parseCode(code);
    const { count } = inlineProxyFunctions(ast);

    expect(count).toBe(0);
  });
});

describe('inferObjectMappings', () => {
  it('should detect object proxy pattern', () => {
    const code = `
      var _0x27a7e9 = {};
      _0x27a7e9["log"] = console.log;
      _0x27a7e9["parse"] = JSON.parse;
    `;
    const ast = parseCode(code);
    const manager = new MappingManager();
    const mappings = inferObjectMappings(ast, manager);

    expect(mappings).toHaveLength(1);
    expect(mappings[0].obfuscatedName).toBe('_0x27a7e9');
    expect(mappings[0].properties['log']).toBe('console.log');
    expect(mappings[0].properties['parse']).toBe('JSON.parse');
  });

  it('should NOT detect non-_0x objects', () => {
    const code = `
      var myObj = {};
      myObj["log"] = console.log;
    `;
    const ast = parseCode(code);
    const manager = new MappingManager();
    const mappings = inferObjectMappings(ast, manager);

    expect(mappings).toHaveLength(0);
  });
});
