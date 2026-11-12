/**
 * Phase 2 — Script Collector
 * 管理通过 CDP 发现的所有脚本，自动去重、获取源码、分析
 */
import type { DiscoveredScript, ScriptParsedInfo } from './types.js';

/**
 * 脚本收集器：跟踪所有已发现的脚本，按 scriptId 索引
 */
export class ScriptCollector {
  private scripts = new Map<string, DiscoveredScript>();
  private sourceHashMap = new Map<string, string>(); // hash → scriptId（去重）

  /**
   * 记录新脚本（来自 Debugger.scriptParsed 事件）
   */
  addScript(info: ScriptParsedInfo): DiscoveredScript | null {
    if (this.scripts.has(info.scriptId)) {
      return null; // 已存在
    }

    const isDynamic = info.url.startsWith('eval:') || info.url === '' || info.url.includes('VM');

    const script: DiscoveredScript = {
      scriptId: info.scriptId,
      url: info.url,
      executionContextId: info.executionContextId,
      startLine: info.startLine,
      startColumn: info.startColumn,
      endLine: info.endLine,
      endColumn: info.endColumn,
      sourceMapURL: info.sourceMapURL,
      hash: '', // 未获取源码时为空
      isDynamic,
      source: null,
      analyzed: false,
    };

    this.scripts.set(info.scriptId, script);
    return script;
  }

  /**
   * 设置脚本源码（来自 Debugger.getScriptSource）
   */
  setScriptSource(scriptId: string, source: string): void {
    const script = this.scripts.get(scriptId);
    if (!script) return;

    script.source = source;
    script.hash = this.hashSource(source);

    // 检查是否重复（同一源码的不同 scriptId）
    const existingId = this.sourceHashMap.get(script.hash);
    if (existingId && existingId !== scriptId) {
      // 重复脚本（可能是页面刷新或重新加载）
      // 当前实现：保留两者，但标记 hash
    }
    this.sourceHashMap.set(script.hash, scriptId);
  }

  /**
   * 标记脚本分析完成
   */
  markAnalyzed(scriptId: string, result: any, error?: string): void {
    const script = this.scripts.get(scriptId);
    if (!script) return;

    script.analyzed = true;
    script.discoveryResult = result;
    if (error) script.analysisError = error;
  }

  /**
   * 获取脚本
   */
  getScript(scriptId: string): DiscoveredScript | undefined {
    return this.scripts.get(scriptId);
  }

  /**
   * 获取所有脚本列表
   */
  getAllScripts(): DiscoveredScript[] {
    return Array.from(this.scripts.values());
  }

  /**
   * 获取未获取源码的脚本
   */
  getScriptsNeedingSource(): DiscoveredScript[] {
    return Array.from(this.scripts.values()).filter(s => s.source === null);
  }

  /**
   * 获取已获取源码但未分析的脚本
   */
  getScriptsNeedingAnalysis(): DiscoveredScript[] {
    return Array.from(this.scripts.values()).filter(
      s => s.source !== null && !s.analyzed
    );
  }

  /**
   * 清空所有脚本（页面刷新时）
   */
  clear(): void {
    this.scripts.clear();
    this.sourceHashMap.clear();
  }

  /**
   * 统计信息
   */
  getStats() {
    const all = Array.from(this.scripts.values());
    return {
      total: all.length,
      withSource: all.filter(s => s.source !== null).length,
      analyzed: all.filter(s => s.analyzed).length,
      dynamic: all.filter(s => s.isDynamic).length,
      failed: all.filter(s => s.analysisError).length,
    };
  }

  private hashSource(source: string): string {
    // 简单哈希：取前 1000 字符 + 长度
    const sample = source.slice(0, 1000);
    let hash = 0;
    for (let i = 0; i < sample.length; i++) {
      hash = ((hash << 5) - hash + sample.charCodeAt(i)) | 0;
    }
    return `${hash.toString(16)}_${source.length}`;
  }
}
