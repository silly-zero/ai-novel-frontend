import { describe, expect, it } from 'vitest'
import type { ChapterItem } from './api'
import { resolveGenerationTarget } from './generationTarget'

function chapter(id: string, order: number): ChapterItem {
  return {
    id,
    novel_id: '1',
    title: `第${order}章`,
    content: '',
    word_count: 0,
    order,
    status: 'Draft',
    derived_status: 'Ready',
    derived_retryable: false,
    created_at: '',
    updated_at: '',
  }
}

const chapters = [chapter('4', 1), chapter('7', 3)]

describe('resolveGenerationTarget', () => {
  it('uses the existing chapter for a matching index', () => {
    expect(resolveGenerationTarget('byIndex', 3, '', chapters)).toEqual({
      chapterIndex: 3,
      chapterId: '7',
      overwrites: true,
    })
  })

  it('creates the requested index when it is unused', () => {
    expect(resolveGenerationTarget('byIndex', 2, '', chapters)).toEqual({
      chapterIndex: 2,
      overwrites: false,
    })
  })

  it('uses the selected chapter and its persisted order', () => {
    expect(resolveGenerationTarget('existing', 99, '4', chapters)).toEqual({
      chapterIndex: 1,
      chapterId: '4',
      overwrites: true,
    })
    expect(() => resolveGenerationTarget('existing', 1, '', chapters)).toThrow('请选择要覆盖的章节')
  })

  it('places a new chapter after the highest order', () => {
    expect(resolveGenerationTarget('new', 1, '', chapters)).toEqual({
      chapterIndex: 4,
      overwrites: false,
    })
    expect(resolveGenerationTarget('new', 1, '', [])).toEqual({
      chapterIndex: 1,
      overwrites: false,
    })
  })
})
