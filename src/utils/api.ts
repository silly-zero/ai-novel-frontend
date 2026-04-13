export type NovelSummary = {
  id: string
  title: string
  description?: string
  status: string
  tags?: string[]
  created_at: string
  updated_at: string
}

export type ChapterItem = {
  id: string
  novel_id: string
  title: string
  content: string
  word_count: number
  order: number
  status: string
  created_at: string
  updated_at: string
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
  chapter_index?: number
  outline?: string
  idea?: string
  editor_notes?: string
  manual_context?: string
}

export type GetNovelResponse = {
  item: NovelSummary
  chapters: ChapterItem[]
}

export type ListChaptersResponse = {
  items: ChapterItem[]
}

export type GetChapterResponse = {
  item: ChapterItem
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

async function apiJson<T>(method: 'POST' | 'PUT' | 'PATCH', path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(withBaseUrl(path), {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const message = text ? `${res.status} ${res.statusText}: ${text}` : `${res.status} ${res.statusText}`
    throw new Error(message)
  }
  return (await res.json()) as T
}

export function listNovels(signal?: AbortSignal) {
  return apiGet<ListNovelsResponse>('/api/v1/novels', signal)
}

export function createNovel(payload: CreateNovelRequest, signal?: AbortSignal) {
  return apiJson<CreateNovelResponse>('POST', '/api/v1/novels', payload, signal)
}

export function getNovel(id: string, signal?: AbortSignal) {
  return apiGet<GetNovelResponse>(`/api/v1/novels/${encodeURIComponent(id)}`, signal)
}

export function listChapters(novelId: string, signal?: AbortSignal) {
  return apiGet<ListChaptersResponse>(`/api/v1/novels/${encodeURIComponent(novelId)}/chapters`, signal)
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

export function previewContext(params: PreviewContextParams, signal?: AbortSignal) {
  const path = withQuery('/api/v1/novel/preview-context', {
    novel_id: params.novel_id,
    chapter_index: params.chapter_index,
    outline: params.outline,
    idea: params.idea,
    editor_notes: params.editor_notes,
    manual_context: params.manual_context,
  })
  return apiGet<PreviewContextResponse>(path, signal)
}

export function buildGenerateChapterUrl(params: PreviewContextParams) {
  const path = withQuery('/api/v1/novel/generate', {
    novel_id: params.novel_id,
    chapter_index: params.chapter_index,
    outline: params.outline,
    idea: params.idea,
    editor_notes: params.editor_notes,
    manual_context: params.manual_context,
  })
  return withBaseUrl(path)
}
