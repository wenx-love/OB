import type { MappingEntry, ObjectMapping } from '../types/index.js';

/**
 * 映射管理器。
 * 统一管理所有 callText → 解码值的映射，支持来源追踪和合并。
 */
export class MappingManager {
  private entries = new Map<string, MappingEntry>();
  private objects = new Map<string, ObjectMapping>();

  /** 添加或更新映射，高置信度覆盖低置信度 */
  set(key: string, entry: MappingEntry): void {
    const existing = this.entries.get(key);
    if (existing && confidenceRank(existing.confidence) >= confidenceRank(entry.confidence)) {
      return; // 不降级
    }
    this.entries.set(key, entry);
  }

  get(key: string): MappingEntry | undefined {
    return this.entries.get(key);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** 批量导入映射 */
  import(records: Record<string, MappingEntry>): void {
    for (const [key, entry] of Object.entries(records)) {
      this.set(key, entry);
    }
  }

  /** 导出为纯对象 */
  export(): Record<string, MappingEntry> {
    return Object.fromEntries(this.entries);
  }

  get size(): number {
    return this.entries.size;
  }

  /** 对象映射（第二阶段） */
  setObject(name: string, mapping: ObjectMapping): void {
    this.objects.set(name, mapping);
  }

  getObject(name: string): ObjectMapping | undefined {
    return this.objects.get(name);
  }

  exportObjects(): ObjectMapping[] {
    return [...this.objects.values()];
  }
}

function confidenceRank(c: MappingEntry['confidence']): number {
  switch (c) {
    case 'confirmed': return 3;
    case 'inferred': return 2;
    case 'manual': return 1;
    default: return 0;
  }
}
