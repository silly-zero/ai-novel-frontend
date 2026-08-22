import type { ChapterItem } from './api'

export type GenerationTargetMode = 'byIndex' | 'existing' | 'new'

export type GenerationTarget = {
  chapterIndex: number
  chapterId?: string
  overwrites: boolean
}

export function resolveGenerationTarget(
  mode: GenerationTargetMode,
  chapterIndex: number,
  selectedChapterId: string,
  chapters: ChapterItem[],
): GenerationTarget {
  if (mode === 'existing') {
    const selected = chapters.find(chapter => chapter.id === selectedChapterId)
    if (!selected) throw new Error('请选择要覆盖的章节')
    return { chapterIndex: selected.order, chapterId: selected.id, overwrites: true }
  }

  if (mode === 'new') {
    const maxOrder = chapters.reduce((max, chapter) => Math.max(max, chapter.order), 0)
    return { chapterIndex: maxOrder + 1, overwrites: false }
  }

  const normalizedIndex = Math.max(1, Math.trunc(chapterIndex || 1))
  const existing = chapters.find(chapter => chapter.order === normalizedIndex)
  if (existing) {
    return { chapterIndex: existing.order, chapterId: existing.id, overwrites: true }
  }
  return { chapterIndex: normalizedIndex, overwrites: false }
}
