import type { GenerateStreamEvent, GenerationContextMeta, GenerationTerminal } from '@/utils/api'

export type GenerationUIState = 'idle' | 'running' | 'cancelling' | 'success' | 'error' | 'cancelled'

export type GenerationEventUpdate = {
  generationId?: string
  meta?: GenerationContextMeta
  appendToken?: string
  clearOutput?: boolean
  status?: string
  error?: string | null
}

export type GenerationTerminalUpdate = {
  state: GenerationUIState
  status: string
  error: string | null
  hasGenerated: boolean
  persistedChapterId: string | null
  persistedChapterIds: string[]
}

function parseGenerationContextMeta(value: unknown): GenerationContextMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('生成上下文摘要格式无效')
  const meta = value as Record<string, unknown>
  if (!Number.isSafeInteger(meta.chapter_index) || (meta.chapter_index as number) <= 0 || (meta.chapter_id !== null && meta.chapter_id !== undefined && (typeof meta.chapter_id !== 'string' || !meta.chapter_id))) throw new Error('生成上下文摘要格式无效')
  if (Number.isSafeInteger(meta.chapter_count) && (meta.chapter_count as number) >= 2) {
    const stats = meta.context_stats
    const contextStats = stats && typeof stats === 'object' && !Array.isArray(stats)
      ? stats as Record<string, unknown>
      : {}
    return {
      chapter_index: meta.chapter_index as number,
      chapter_id: typeof meta.chapter_id === 'string' ? meta.chapter_id : null,
      chapter_count: meta.chapter_count as number,
      context_stats: {
        context_lines: Number.isSafeInteger(contextStats.context_lines) && (contextStats.context_lines as number) >= 0 ? contextStats.context_lines as number : 0,
        scene_card_lines: Number.isSafeInteger(contextStats.scene_card_lines) && (contextStats.scene_card_lines as number) >= 0 ? contextStats.scene_card_lines as number : 0,
      },
    }
  }
  const stats = meta.context_stats
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) throw new Error('生成上下文摘要格式无效')
  const contextStats = stats as Record<string, unknown>
  if (![contextStats.context_lines, contextStats.scene_card_lines].every(value => Number.isSafeInteger(value) && (value as number) >= 0)) throw new Error('生成上下文统计格式无效')
  return { chapter_index: meta.chapter_index as number, chapter_id: meta.chapter_id as string | null, context_stats: { context_lines: contextStats.context_lines as number, scene_card_lines: contextStats.scene_card_lines as number } }
}
export function reduceGenerationEvent(
  event: GenerateStreamEvent,
  state: GenerationUIState,
  cancelRequested: boolean,
): GenerationEventUpdate {
  if (event.event === 'start') {
    const parsed = JSON.parse(event.data || '{}') as { generation_id?: unknown; message?: unknown }
    if (typeof parsed.generation_id !== 'string' || !parsed.generation_id) {
      throw new Error('生成开始事件缺少 generation_id')
    }
    return {
      generationId: parsed.generation_id,
      status: cancelRequested
        ? '正在取消'
        : typeof parsed.message === 'string' && parsed.message
          ? parsed.message
          : '已开始生成',
    }
  }

  if (event.event === 'context_meta') {
    const parsed = JSON.parse(event.data || '{}') as unknown
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('生成上下文元数据格式无效')
    }
    return { meta: parseGenerationContextMeta(parsed) }
  }

  if (event.event === 'retry') {
    const parsed = JSON.parse(event.data || '{}') as { retry_count?: unknown; critique?: unknown }
    const update: GenerationEventUpdate = { clearOutput: true }
    if (state !== 'cancelling') {
      const retryCount = typeof parsed.retry_count === 'number' ? parsed.retry_count : 1
      update.status = `审查未通过，开始第 ${retryCount} 次重写`
      update.error = typeof parsed.critique === 'string' && parsed.critique
        ? `重写原因：${parsed.critique}`
        : null
    }
    return update
  }

  const parsed = JSON.parse(event.data || '{}') as { token?: unknown }
  if (typeof parsed.token !== 'string') {
    throw new Error('正文 Token 格式无效')
  }
  return { appendToken: parsed.token }
}

export function reduceGenerationTerminal(terminal: GenerationTerminal): GenerationTerminalUpdate {
  const persistedChapterIds = Array.isArray(terminal.chapter_ids)
    ? terminal.chapter_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : terminal.chapter_id
      ? [terminal.chapter_id]
      : []
  const persistedChapterId = persistedChapterIds[0] ?? null
  const success = terminal.status === 'success'
  const persistedError = terminal.status === 'error' && persistedChapterId !== null
  return {
    state: terminal.status,
    status:
      success && persistedChapterIds.length > 1
        ? `连续写作批次已保存 ${persistedChapterIds.length} 章；事件未完时可继续下一批`
        : success && persistedChapterId
          ? '生成并保存完成'
          : success
            ? '生成完成'
          : persistedError
            ? '正文已保存，派生处理未完成'
            : terminal.status === 'cancelled'
              ? '生成已取消，正文未保存'
              : '生成失败，正文未保存',
    error: terminal.status === 'error' ? terminal.message || '生成失败' : null,
    hasGenerated: success || persistedError,
    persistedChapterId,
    persistedChapterIds,
  }
}
