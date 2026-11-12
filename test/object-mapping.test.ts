import { describe, it, expect } from 'vitest';
import { parseCode } from '../src/core/parser.js';
import { generateCode } from '../src/core/generator.js';
import { MappingManager } from '../src/core/mapping.js';
import { inferObjectMappings, applyObjectMappings } from '../src/core/member-transformer.js';

describe('applyObjectMappings', () => {
  it('should replace _0x.prop(args) with real API call', () => {
    const code = `
      var _0x27a7e9 = {};
      _0x27a7e9.log = console.log;
      _0x27a7e9.stringify = JSON.stringify;
      _0x27a7e9.log("test");
      var x = _0x27a7e9.stringify({a: 1});
    `;
    const ast = parseCode(code);
    const manager = new MappingManager();
    inferObjectMappings(ast, manager);

    const { count } = applyObjectMappings(ast, manager);
    const output = generateCode(ast);

    expect(count).toBeGreaterThan(0);
    expect(output).toContain('console.log("test")');
    expect(output).toContain('JSON.stringify(');
    // 赋值语句本身不被替换
    expect(output).toContain('_0x27a7e9.log = console.log');
    expect(output).toContain('_0x27a7e9.stringify = JSON.stringify');
  });

  it('should replace non-call member references too', () => {
    const code = `
      var _0x1234 = {};
      _0x1234.parse = JSON.parse;
      var fn = _0x1234.parse;
      fn('{"a":1}');
    `;
    const ast = parseCode(code);
    const manager = new MappingManager();
    inferObjectMappings(ast, manager);

    applyObjectMappings(ast, manager);
    const output = generateCode(ast);

    expect(output).toContain('var fn = JSON.parse');
  });

  it('should NOT replace if object is reassigned', () => {
    const code = `
      var _0x5678 = {};
      _0x5678.log = console.log;
      _0x5678 = somethingElse;
      _0x5678.log("test");
    `;
    const ast = parseCode(code);
    const manager = new MappingManager();
    inferObjectMappings(ast, manager);

    const { count } = applyObjectMappings(ast, manager);
    const output = generateCode(ast);

    // 因为 _0x5678 被重新赋值，不应替换
    expect(count).toBe(0);
    expect(output).toContain('_0x5678.log("test")');
  });

  it('should NOT replace unmapped properties', () => {
    const code = `
      var _0xabcd = {};
      _0xabcd.log = console.log;
      _0xabcd.customThing("test");
    `;
    const ast = parseCode(code);
    const manager = new MappingManager();
    inferObjectMappings(ast, manager);

    applyObjectMappings(ast, manager);
    const output = generateCode(ast);

    // customThing 没有映射，不替换
    expect(output).toContain('_0xabcd.customThing("test")');
  });

  it('should NOT replace non-_0x objects', () => {
    const code = `
      var myObj = {};
      myObj.log = console.log;
      myObj.log("test");
    `;
    const ast = parseCode(code);
    const manager = new MappingManager();
    inferObjectMappings(ast, manager);

    const { count } = applyObjectMappings(ast, manager);

    // inferObjectMappings 只收集 _0x 开头的对象
    expect(count).toBe(0);
  });

  it('should work with computed property access', () => {
    const code = `
      var _0xef01 = {};
      _0xef01["log"] = console.log;
      _0xef01["log"]("test");
    `;
    const ast = parseCode(code);
    const manager = new MappingManager();
    inferObjectMappings(ast, manager);

    applyObjectMappings(ast, manager);
    const output = generateCode(ast);

    expect(output).toContain('console.log("test")');
  });
});
