export type NovelSummary = {
  id: string
  title: string
  description?: string
  status: string
  tags?: string[]
  created_at: string
  updated_at: string
}

export type NovelDetail = NovelSummary & {
  idea?: string
  outline?: string
}

export type DerivedStatus = 'Pending' | 'Ready' | 'Failed'

export type DerivedTaskStatus = 'Pending' | 'Running' | 'Ready' | 'Failed'

export type DerivedTaskItem = {
  handler_key: string
  status: DerivedTaskStatus
  attempts: number
  last_error?: string
}

export type ChapterItem = {
  id: string
  novel_id: string
  title: string
  content: string
  word_count: number
  order: number
  status: string
  derived_status: DerivedStatus
  derived_retryable: boolean
  derived_tasks?: DerivedTaskItem[]
  created_at: string
  updated_at: string
}

export type ChapterDetailItem = ChapterItem & {
  derived_tasks: DerivedTaskItem[]
}

export type ChapterDerivedSnapshot = {
  chapter_id: string
  derived_status: DerivedStatus
  derived_retryable: boolean
  derived_tasks: DerivedTaskItem[]
  error: string
}

export type ListNovelsResponse = {
  items: NovelSummary[]
}

export type CreateNovelRequest = {
  title: string
  description?: string
  type?: string
  tags?: string[]
}

export type CreateNovelResponse = {
  item: NovelSummary
}

export type PreviewContextResponse = {
  novel_id: string
  chapter_index: number
  full_outline: string
  outline: string
  scene_card: string
  context: string
  editor_notes: string
  manual_context: string
}

export type PreviewContextParams = {
  novel_id: string
  chapter_id?: string
  persist?: 0 | 1
  chapter_index?: number
  outline?: string
  idea?: string
  existing_outline?: string
  outline_mode?: 'full' | 'extend'
  outline_start?: number
  outline_end?: number
  editor_notes?: string
  manual_context?: string
}

export type GenerationContextMeta = {
  chapter_index: number
  chapter_id: string | null
  chapter_count?: number
  context_stats?: {
    context_lines: number
    scene_card_lines: number
  }
}
export type GenerateChapterRequest = {
  novel_id: number
  chapter_id?: number
  persist?: boolean
  chapter_index?: number
  event_chapter_count?: 2 | 3
  outline?: string
  idea?: string
  existing_outline?: string
  outline_start?: number
  outline_end?: number
  editor_notes?: string
  manual_context?: string
}

export type GetNovelResponse = {
  item: NovelDetail
  chapters: ChapterItem[]
}

export type ListChaptersResponse = {
  items: ChapterItem[]
}

export type GetChapterResponse = {
  item: ChapterDetailItem
}

export type CreateChapterRequest = {
  title?: string
  content?: string
  order?: number
  status?: string
}

export type CreateChapterResponse = {
  item: ChapterItem
}

export type UpdateChapterRequest = {
  title?: string
  content?: string
  order?: number
  status?: string
}

export type UpdateChapterResponse = {
  item: ChapterItem
}

export type UpdateNovelRequest = {
  idea?: string
  outline?: string
}

export type UpdateNovelResponse = {
  item: NovelDetail
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

function withBaseUrl(path: string) {
  if (!API_BASE_URL) return path
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

function withQuery(path: string, params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    q.set(k, String(v))
  }
  const qs = q.toString()
  if (!qs) return path
  return path.includes('?') ? `${path}&${qs}` : `${path}?${qs}`
}

function apiDeleteEmpty(obj: Record<string, unknown>) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) delete obj[k]
  }
  return obj
}

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(withBaseUrl(path), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const message = body ? `${res.status} ${res.statusText}: ${body}` : `${res.status} ${res.statusText}`
    throw new Error(message)
  }
  return (await res.json()) as T
}

export class APIResponseError extends Error {
  readonly code?: string

  constructor(
    message: string,
    readonly status: number,
    code?: string,
  ) {
    super(message)
    this.name = 'APIResponseError'
    this.code = code
  }
}

export class APITimeoutError extends Error {
  constructor(message = '请求超时，请稍后重试') {
    super(message)
    this.name = 'APITimeoutError'
  }
}

export class RetryChapterDerivedError extends APIResponseError {
  constructor(
    message: string,
    status: number,
    readonly snapshot: ChapterDerivedSnapshot,
  ) {
    super(message, status)
    this.name = 'RetryChapterDerivedError'
  }
}

function isDerivedStatus(value: unknown): value is DerivedStatus {
  return value === 'Pending' || value === 'Ready' || value === 'Failed'
}

function isDerivedTaskStatus(value: unknown): value is DerivedTaskStatus {
  return value === 'Pending' || value === 'Running' || value === 'Ready' || value === 'Failed'
}

function isDerivedTaskItem(value: unknown): value is DerivedTaskItem {
  if (!value || typeof value !== 'object') return false
  const task = value as Partial<DerivedTaskItem>
  return typeof task.handler_key === 'string'
    && isDerivedTaskStatus(task.status)
    && typeof task.attempts === 'number'
    && Number.isInteger(task.attempts)
    && task.attempts >= 0
    && (task.last_error === undefined || typeof task.last_error === 'string')
}

function isChapterDerivedSnapshot(value: unknown): value is ChapterDerivedSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<ChapterDerivedSnapshot>
  return typeof snapshot.chapter_id === 'string'
    && isDerivedStatus(snapshot.derived_status)
    && typeof snapshot.derived_retryable === 'boolean'
    && Array.isArray(snapshot.derived_tasks)
    && snapshot.derived_tasks.every(isDerivedTaskItem)
    && typeof snapshot.error === 'string'
}

async function apiJson<T>(
  method: 'POST' | 'PUT' | 'PATCH',
  path: string,
  body: unknown,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<T> {
  const requestController = new AbortController()
  let timedOut = false
  const forwardAbort = () => requestController.abort(signal?.reason)
  if (signal?.aborted) {
    forwardAbort()
  } else {
    signal?.addEventListener('abort', forwardAbort, { once: true })
  }
  const timeout = timeoutMs === undefined
    ? undefined
    : setTimeout(() => {
      timedOut = true
      requestController.abort(new DOMException('请求超时', 'TimeoutError'))
    }, timeoutMs)

  const request = (async () => {
    const res = await fetch(withBaseUrl(path), {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
      signal: requestController.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let code: string | undefined
      let message = text ? `${res.status} ${res.statusText}: ${text}` : `${res.status} ${res.statusText}`
      try {
        const parsed = JSON.parse(text) as { error_code?: unknown; message?: unknown }
        if (typeof parsed.error_code === 'string') code = parsed.error_code
        if (typeof parsed.message === 'string' && parsed.message.trim()) message = parsed.message
      } catch {
        // Keep the bounded HTTP fallback for non-JSON responses.
      }
      throw new APIResponseError(message, res.status, code)
    }
    return (await res.json()) as T
  })()
  void request.catch(() => undefined)

  let deadlineTimer: ReturnType<typeof setTimeout> | undefined
  try {
    if (timeoutMs === undefined) return await request
    const deadline = new Promise<never>((_, reject) => {
      deadlineTimer = setTimeout(() => reject(new APITimeoutError()), timeoutMs)
    })
    return await Promise.race([request, deadline])
  } catch (err) {
    if (timedOut) throw new APITimeoutError()
    throw err
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

async function apiDelete(path: string, body: unknown = {}, signal?: AbortSignal) {
  const res = await fetch(withBaseUrl(path), {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const message = text ? `${res.status} ${res.statusText}: ${text}` : `${res.status} ${res.statusText}`
    throw new APIResponseError(message, res.status)
  }
}

export function listNovels(signal?: AbortSignal) {
  return apiGet<ListNovelsResponse>('/api/v1/novels', signal)
}

export function createNovel(payload: CreateNovelRequest, signal?: AbortSignal) {
  return apiJson<CreateNovelResponse>('POST', '/api/v1/novels', payload, signal)
}

export function deleteNovel(id: string, signal?: AbortSignal) {
  return apiDelete(`/api/v1/novels/${encodeURIComponent(id)}`, { confirm: true }, signal)
}

export function getNovel(id: string, signal?: AbortSignal) {
  return apiGet<GetNovelResponse>(`/api/v1/novels/${encodeURIComponent(id)}`, signal)
}

const PREVIEW_CONTEXT_TIMEOUT_MS = 5 * 60 * 1000
const NOVEL_UPDATE_TIMEOUT_MS = 30 * 1000

export function updateNovel(id: string, payload: UpdateNovelRequest, signal?: AbortSignal) {
  return apiJson<UpdateNovelResponse>(
    'PUT',
    `/api/v1/novels/${encodeURIComponent(id)}`,
    apiDeleteEmpty({ ...payload }),
    signal,
    NOVEL_UPDATE_TIMEOUT_MS,
  )
}

export function listChapters(
  novelId: string,
  signal?: AbortSignal,
  pagination: { limit?: number; offset?: number } = {},
) {
  const path = withQuery(`/api/v1/novels/${encodeURIComponent(novelId)}/chapters`, {
    limit: pagination.limit,
    offset: pagination.offset,
  })
  return apiGet<ListChaptersResponse>(path, signal)
}

export function getChapter(id: string, signal?: AbortSignal) {
  return apiGet<GetChapterResponse>(`/api/v1/chapters/${encodeURIComponent(id)}`, signal)
}

export function createChapter(novelId: string, payload: CreateChapterRequest = {}, signal?: AbortSignal) {
  return apiJson<CreateChapterResponse>(
    'POST',
    `/api/v1/novels/${encodeURIComponent(novelId)}/chapters`,
    apiDeleteEmpty({ ...payload }),
    signal,
  )
}

export function updateChapter(id: string, payload: UpdateChapterRequest, signal?: AbortSignal) {
  return apiJson<UpdateChapterResponse>(
    'PUT',
    `/api/v1/chapters/${encodeURIComponent(id)}`,
    apiDeleteEmpty({ ...payload }),
    signal,
  )
}

export function deleteChapter(id: string, signal?: AbortSignal) {
  return apiDelete(`/api/v1/chapters/${encodeURIComponent(id)}`, {}, signal)
}

export async function retryChapterDerived(id: string, signal?: AbortSignal): Promise<ChapterDerivedSnapshot> {
  const res = await fetch(withBaseUrl(`/api/v1/chapters/${encodeURIComponent(id)}/derived/retry`), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal,
  })
  const text = await res.text().catch(() => '')
  let parsed: unknown
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = undefined
    }
  }
  if (res.ok && isChapterDerivedSnapshot(parsed)) return parsed
  if (res.status === 500 && isChapterDerivedSnapshot(parsed)) {
    throw new RetryChapterDerivedError(parsed.error || '派生任务重试失败', res.status, parsed)
  }
  const message = text ? `${res.status} ${res.statusText}: ${text}` : `${res.status} ${res.statusText}`
  throw new APIResponseError(message, res.status)
}

export function previewContext(params: PreviewContextParams, signal?: AbortSignal) {
  return apiJson<PreviewContextResponse>('POST', '/api/v1/novel/preview-context', {
    novel_id: Number(params.novel_id),
    chapter_index: params.chapter_index,
    outline: params.outline,
    idea: params.idea,
    existing_outline: params.existing_outline,
    outline_mode: params.outline_mode,
    outline_start: params.outline_start,
    outline_end: params.outline_end,
    editor_notes: params.editor_notes,
    manual_context: params.manual_context,
  }, signal, PREVIEW_CONTEXT_TIMEOUT_MS)
}

export type GenerateStreamEvent = {
  event: 'start' | 'context_meta' | 'token' | 'retry'
  data: string
}

export type GenerationTerminal = {
  generation_id: string
  status: 'success' | 'error' | 'cancelled'
  message?: string
  chapter_id?: string
  chapter_ids?: string[]
  persisted?: boolean
}

export type CancelGenerationResponse = {
  generation_id: string
  status: 'cancelling'
}

export async function cancelGeneration(novelId: string, generationId: string, signal?: AbortSignal) {
  const timeoutController = new AbortController()
  const forwardAbort = () => timeoutController.abort(signal?.reason)
  if (signal?.aborted) {
    forwardAbort()
  } else {
    signal?.addEventListener('abort', forwardAbort, { once: true })
  }
  const timeout = window.setTimeout(() => timeoutController.abort(new DOMException('取消请求超时', 'TimeoutError')), 5000)
  try {
    return await apiJson<CancelGenerationResponse>(
      'POST',
      `/api/v1/novels/${encodeURIComponent(novelId)}/generate/cancel`,
      { generation_id: generationId },
      timeoutController.signal,
    )
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

export async function streamGenerateChapter(
  params: GenerateChapterRequest,
  signal: AbortSignal,
  onEvent: (event: GenerateStreamEvent) => void,
): Promise<GenerationTerminal> {
  const res = await fetch(withBaseUrl(params.event_chapter_count ? '/api/v1/novel/generate-event' : '/api/v1/novel/generate'), {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
    signal,
  })
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).trim()
    const message = body ? `${res.status} ${res.statusText}: ${body}` : `${res.status} ${res.statusText}`
    throw new Error(message)
  }
  if (!res.body) {
    throw new Error('生成响应不支持流式读取')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventName = 'message'
  let dataLines: string[] = []
  let startedGenerationId: string | null = null
  let terminal: GenerationTerminal | null = null

  const dispatch = () => {
    if (dataLines.length === 0) {
      eventName = 'message'
      return
    }
    const event = { event: eventName, data: dataLines.join('\n') }
    eventName = 'message'
    dataLines = []
    if (terminal) {
      throw new Error('生成终态后收到额外事件')
    }
    if (event.event === 'terminal') {
      const parsed = JSON.parse(event.data || '{}') as Partial<GenerationTerminal>
      if (
        typeof parsed.generation_id !== 'string' ||
        !['success', 'error', 'cancelled'].includes(parsed.status ?? '') ||
        (parsed.persisted === true && ((typeof parsed.chapter_id !== 'string' || !parsed.chapter_id) && (!Array.isArray(parsed.chapter_ids) || parsed.chapter_ids.length === 0)))
      ) {
        throw new Error('生成终态格式无效')
      }
      if (!startedGenerationId || parsed.generation_id !== startedGenerationId) {
        throw new Error('生成终态与当前任务不匹配')
      }
      terminal = parsed as GenerationTerminal
      return
    }
    if (!['start', 'context_meta', 'token', 'retry'].includes(event.event)) {
      throw new Error(`未知生成事件：${event.event}`)
    }
    if (event.event === 'start') {
      const parsed = JSON.parse(event.data || '{}') as { generation_id?: unknown }
      if (typeof parsed.generation_id !== 'string' || !parsed.generation_id) {
        throw new Error('生成开始事件格式无效')
      }
      if (startedGenerationId) {
        throw new Error('重复的生成开始事件')
      }
      startedGenerationId = parsed.generation_id
    } else if (!startedGenerationId) {
      throw new Error('生成开始前收到过程事件')
    }
    onEvent(event as GenerateStreamEvent)
  }

  const processLine = (line: string) => {
    if (line === '') {
      dispatch()
      return
    }
    if (line.startsWith(':')) return
    const separator = line.indexOf(':')
    const field = separator === -1 ? line : line.slice(0, separator)
    let value = separator === -1 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') eventName = value || 'message'
    if (field === 'data') dataLines.push(value)
  }

  let streamDone = false
  try {
    while (!streamDone) {
      const { done, value } = await reader.read()
      streamDone = done
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) processLine(line)
    }
    if (buffer !== '') processLine(buffer)
    dispatch()
    if (!terminal) {
      throw new Error('生成连接提前结束')
    }
    return terminal
  } catch (err) {
    await reader.cancel().catch(() => undefined)
    throw err
  } finally {
    reader.releaseLock()
  }
}
