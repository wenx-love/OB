import { parse, type ParserOptions } from '@babel/parser';
import type { File } from '@babel/types';

const DEFAULT_OPTIONS: ParserOptions = {
  sourceType: 'unambiguous',
  allowImportExportEverywhere: true,
  allowReturnOutsideFunction: true,
  allowSuperOutsideMethod: true,
  plugins: [
    'dynamicImport',
    'classProperties',
    'objectRestSpread',
    'optionalChaining',
    'nullishCoalescingOperator',
  ],
};

/**
 * 将 JavaScript 源码解析为 Babel AST。
 * 宽容模式：接受各种非标准语法，避免解析失败。
 */
export function parseCode(code: string, options?: Partial<ParserOptions>): File {
  return parse(code, { ...DEFAULT_OPTIONS, ...options });
}
