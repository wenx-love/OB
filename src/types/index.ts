import type { Node, File } from '@babel/types';

/** 解码器信息：描述一个 OB 字符串解密函数的完整结构 */
export interface DecoderInfo {
  /** 解码器函数名，如 "_0x29ae5c" */
  name: string;
  /** 字符串数组变量名，如 "_0xabc123" */
  arrayName: string;
  /** 字符串数组 AST 节点 */
  arrayNode: Node;
  /** 旋转 IIFE AST 节点（可选，有些混淆无旋转） */
  rotateNode: Node | null;
  /** 解码器函数 AST 节点 */
  decoderNode: Node;
  /** 解码器源码片段（用于沙箱执行） */
  decoderSource: string;
  /** 检测到的编码算法 */
  algorithm: 'none' | 'base64' | 'rc4' | 'unknown';
}

/** 单条映射记录 */
export interface MappingEntry {
  /** 原始调用表达式文本，如 '_0x29ae5c(795, "yBNh")' */
  callText: string;
  /** 解码后的值 */
  value: string | number | boolean;
  /** 值类型 */
  type: 'string' | 'number' | 'boolean';
  /** 置信度 */
  confidence: 'confirmed' | 'inferred' | 'manual';
  /** 来源 */
  source: 'static-decoder' | 'sandbox-eval' | 'runtime-capture' | 'manual';
}

/** 对象映射记录（第二阶段） */
export interface ObjectMapping {
  /** 混淆变量名 */
  obfuscatedName: string;
  /** 真实对象名 */
  realName: string;
  /** 置信度 */
  confidence: 'confirmed' | 'inferred' | 'manual';
  /** 已确认的属性映射 */
  properties: Record<string, string>;
}

/** 确定性分析结果 */
export interface DeterministicResult {
  /** 是否确定 */
  deterministic: boolean;
  /** 如果确定，计算出的值 */
  value?: unknown;
  /** 判断理由 */
  reason: string;
}

/** 单条转换记录 */
export interface TransformRecord {
  /** 行号 (1-based) */
  line: number;
  /** 列号 (0-based) */
  column: number;
  /** 原始表达式 */
  original: string;
  /** 替换后的表达式 */
  replaced: string;
  /** 映射来源 */
  source: MappingEntry['source'] | 'ast-transform';
}

/** Pipeline 执行结果 */
export interface RecoverResult {
  /** 还原后的代码 */
  code: string;
  /** 转换记录 */
  transforms: TransformRecord[];
  /** 映射表 */
  mappings: Record<string, MappingEntry>;
  /** 对象映射（第二阶段） */
  objectMappings: ObjectMapping[];
  /** 检测到的解码器 */
  decoders: DecoderInfo[];
  /** 统计 */
  stats: {
    totalCalls: number;
    resolvedCalls: number;
    skippedCalls: number;
    timeTaken: number;
    passes: number;
  };
}

/** Pipeline 配置 */
export interface RecoverOptions {
  /** 是否尝试沙箱执行解码器（默认 true） */
  useSandbox?: boolean;
  /** 沙箱执行函数（由外部注入，浏览器用 iframe，Node 用 vm） */
  sandboxEval?: (code: string) => Promise<unknown>;
  /** 最大解码尝试索引范围（默认 5000） */
  maxDecodeIndex?: number;
  /** 是否启用对象映射推断（第二阶段，默认 false） */
  enableObjectMapping?: boolean;
  /** 外部提供的额外映射 */
  externalMappings?: Record<string, MappingEntry>;
}
