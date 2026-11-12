import _generate from '@babel/generator';
import type { File } from '@babel/types';

const generate = (typeof _generate === 'function' ? _generate : (_generate as any).default) as typeof _generate;

export interface GenerateOptions {
  /** 是否保留注释（默认 true） */
  comments?: boolean;
  /** 缩进字符（默认 2 空格） */
  indent?: string;
}

/**
 * 从 AST 生成 JavaScript 代码。
 */
export function generateCode(ast: File, options: GenerateOptions = {}): string {
  const { comments = true, indent = '  ' } = options;

  const result = generate(ast, {
    comments,
    jsescOption: { minimal: true },
    retainLines: false,
    compact: false,
  } as any);  // Babel Generator 类型不完整，使用 any

  return result.code;
}
