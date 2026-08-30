import { describe, expect, it } from 'vitest'
import {
  derivedStatusClass,
  derivedStatusLabel,
  derivedTaskLabel,
  derivedTaskStatusLabel,
} from './derivedState'

describe('derived state labels', () => {
  it('maps chapter derived states', () => {
    expect(derivedStatusLabel('Ready')).toBe('派生已就绪')
    expect(derivedStatusLabel('Pending')).toBe('派生处理中')
    expect(derivedStatusLabel('Failed')).toBe('辅助数据未完成')
    expect(derivedStatusClass('Failed')).toContain('red')
  })

  it('maps task labels and safely falls back for unknown handlers', () => {
    expect(derivedTaskLabel('memory')).toBe('记忆索引')
    expect(derivedTaskLabel('character')).toBe('角色状态')
    expect(derivedTaskLabel('world')).toBe('世界设定')
    expect(derivedTaskLabel('custom')).toBe('未知派生任务')
    expect(derivedTaskStatusLabel('Running')).toBe('处理中')
  })
})
