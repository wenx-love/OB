/**
 * Phase 4: 哈希工具 - 跨环境 SHA-256 实现
 * 
 * 同时支持 Node.js 和浏览器环境。
 * 浏览器环境使用 Web Crypto API (crypto.subtle.digest)。
 * Node.js 环境使用 node:crypto createHash。
 */

/**
 * 计算字符串的 SHA-256 哈希（十六进制字符串）
 * @param text 待哈希的文本（UTF-8）
 * @returns Promise<string> 64 字符的十六进制哈希值
 */
export async function sha256(text: string): Promise<string> {
  // 浏览器环境：使用 Web Crypto API
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Node.js 环境：动态导入 node:crypto
  // @ts-ignore - Node.js 环境
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * 计算脚本源码的 SHA-256 哈希（别名）
 * @param source 脚本源码
 * @returns Promise<string> 64 字符的十六进制哈希值
 */
export const computeScriptHash = sha256;
