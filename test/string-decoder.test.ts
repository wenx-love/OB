import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseCode } from '../src/core/parser.js';
import { detectDecoders } from '../src/core/string-decoder.js';

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

describe('detectDecoders', () => {
  it('should detect string array + rotate + decoder in simple sample', () => {
    const code = fixture('simple-string-array.js');
    const ast = parseCode(code);
    const decoders = detectDecoders(ast, code);

    expect(decoders).toHaveLength(1);

    const d = decoders[0];
    expect(d.name).toBe('_0x29ae5c');
    expect(d.arrayName).toBe('_0xabc123');
    expect(d.rotateNode).not.toBeNull();
    expect(d.algorithm).toBe('base64');
    expect(d.decoderSource).toContain('_0xabc123');
    expect(d.decoderSource).toContain('_0x29ae5c');
    expect(d.decoderSource).toContain('atob');
  });

  it('should return empty array for non-obfuscated code', () => {
    const code = 'var x = 1; console.log(x);';
    const ast = parseCode(code);
    const decoders = detectDecoders(ast, code);
    expect(decoders).toHaveLength(0);
  });
});
