import type { GenerateStreamEvent, GenerationTerminal } from '@/utils/api'

export type GenerationUIState = 'idle' | 'running' | 'cancelling' | 'success' | 'error' | 'cancelled'

export type GenerationEventUpdate = {
  generationId?: string
  meta?: Record<string, unknown>
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
    return { meta: parsed as Record<string, unknown> }
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
  const persistedChapterId = terminal.persisted === true && terminal.chapter_id ? terminal.chapter_id : null
  const success = terminal.status === 'success'
  const persistedError = terminal.status === 'error' && persistedChapterId !== null
  return {
    state: terminal.status,
    status:
      success && persistedChapterId
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
  }
}
