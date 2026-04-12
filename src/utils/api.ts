export type NovelSummary = {
  id: string
  title: string
  description?: string
  status: string
  tags?: string[]
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

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

function withBaseUrl(path: string) {
  if (!API_BASE_URL) return path
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
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
