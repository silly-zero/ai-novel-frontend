import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APIResponseError,
  RetryChapterDerivedError,
  buildGenerateChapterUrl,
  listChapters,
  retryChapterDerived,
  streamGenerateChapter,
} from './api'

const encoder = new TextEncoder()

function sseResponse(chunks: string[], status = 200) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildGenerateChapterUrl', () => {
  it('includes the persisted chapter target', () => {
    expect(buildGenerateChapterUrl({
      novel_id: '7',
      chapter_id: '11',
      chapter_index: 4,
      persist: 1,
    })).toContain('novel_id=7&chapter_id=11&persist=1&chapter_index=4')
  })
})

describe('listChapters', () => {
  it('forwards pagination when loading the complete target list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"items":[]}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await listChapters('novel/1', undefined, { limit: 200, offset: 400 })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/novels/novel%2F1/chapters?limit=200&offset=400',
      expect.objectContaining({ method: 'GET' }),
    )
  })
})

describe('retryChapterDerived', () => {
  const snapshot = {
    chapter_id: 'chapter/1',
    derived_status: 'Failed' as const,
    derived_retryable: true,
    derived_tasks: [{ handler_key: 'memory', status: 'Failed' as const, attempts: 2, last_error: 'failed' }],
    error: '派生任务重试失败',
  }

  it('posts to the encoded chapter path and returns a successful snapshot', async () => {
    const ready = { ...snapshot, derived_status: 'Ready' as const, derived_retryable: false, error: '' }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(ready), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(retryChapterDerived('chapter/1')).resolves.toEqual(ready)
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/chapters/chapter%2F1/derived/retry', expect.objectContaining({
      method: 'POST',
      body: '{}',
    }))
  })

  it('preserves a 500 snapshot in a typed error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot), {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'application/json' },
    })))

    const error = await retryChapterDerived('1').catch(value => value)
    expect(error).toBeInstanceOf(RetryChapterDerivedError)
    expect((error as RetryChapterDerivedError).snapshot).toEqual(snapshot)
    expect((error as RetryChapterDerivedError).status).toBe(500)
  })

  it('uses the ordinary API error for conflicts and malformed 500 responses', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('chapter derived data is not retryable', { status: 409, statusText: 'Conflict' }))
      .mockResolvedValueOnce(new Response('{"unexpected":true}', { status: 500, statusText: 'Internal Server Error' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...snapshot, derived_tasks: [{}] }), { status: 500, statusText: 'Internal Server Error' })))

    await expect(retryChapterDerived('1')).rejects.toBeInstanceOf(APIResponseError)
    const malformed = await retryChapterDerived('1').catch(value => value)
    expect(malformed).toBeInstanceOf(APIResponseError)
    expect(malformed).not.toBeInstanceOf(RetryChapterDerivedError)
    await expect(retryChapterDerived('1')).rejects.not.toBeInstanceOf(RetryChapterDerivedError)
  })
})

describe('streamGenerateChapter', () => {
  it('preserves process event order across arbitrary chunks and returns success terminal', async () => {
    const response = sseResponse([
      'event: start\ndata: {"generation_id":"generation-1"}\n\nevent: context_',
      'meta\ndata: {"chapter_index":2}\n\nevent: token\ndata: {"token":"第一段"}\n',
      '\nevent: retry\ndata: {"retry_count":1,"critique":"补充冲突"}\n\n',
      'event: token\ndata: {"token":"第二段"}\n\nevent: terminal\ndata: {"generation_id":"generation-1",',
      '"status":"success"}\n\n',
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    const events: Array<{ event: string; data: string }> = []

    const terminal = await streamGenerateChapter(
      { novel_id: '7', chapter_index: 2 },
      new AbortController().signal,
      event => events.push(event),
    )

    expect(events.map(event => event.event)).toEqual(['start', 'context_meta', 'token', 'retry', 'token'])
    expect(events[2].data).toBe('{"token":"第一段"}')
    expect(terminal).toEqual({ generation_id: 'generation-1', status: 'success' })
  })

  it.each([
    ['error', '模型断流'],
    ['cancelled', undefined],
  ] as const)('returns %s terminal without exposing it as a process event', async (status, message) => {
    const terminalData = JSON.stringify({ generation_id: 'generation-1', status, message })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'event: start\ndata: {"generation_id":"generation-1"}\n\n',
      `event: terminal\ndata: ${terminalData}\n\n`,
    ])))
    const events: string[] = []

    const terminal = await streamGenerateChapter(
      { novel_id: '7' },
      new AbortController().signal,
      event => events.push(event.event),
    )

    expect(events).toEqual(['start'])
    expect(terminal.status).toBe(status)
    expect(terminal.message).toBe(message)
  })

  it('rejects persisted terminals without a chapter id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'event: start\ndata: {"generation_id":"generation-1"}\n\n',
      'event: terminal\ndata: {"generation_id":"generation-1","status":"success","persisted":true}\n\n',
    ])))

    await expect(streamGenerateChapter(
      { novel_id: '7', persist: 1 },
      new AbortController().signal,
      () => undefined,
    )).rejects.toThrow('生成终态格式无效')
  })

  it('rejects a connection that ends without a terminal event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'event: start\ndata: {"generation_id":"generation-1"}\n\n',
      'event: token\ndata: {"token":"不完整"}\n\n',
    ])))

    await expect(streamGenerateChapter(
      { novel_id: '7' },
      new AbortController().signal,
      () => undefined,
    )).rejects.toThrow('生成连接提前结束')
  })

  it('rejects process events before start and mismatched terminals', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(sseResponse([
      'event: token\ndata: {"token":"越序"}\n\n',
    ])))
    await expect(streamGenerateChapter(
      { novel_id: '7' },
      new AbortController().signal,
      () => undefined,
    )).rejects.toThrow('生成开始前收到过程事件')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(sseResponse([
      'event: start\ndata: {"generation_id":"generation-1"}\n\n',
      'event: terminal\ndata: {"generation_id":"generation-2","status":"error"}\n\n',
    ])))
    await expect(streamGenerateChapter(
      { novel_id: '7' },
      new AbortController().signal,
      () => undefined,
    )).rejects.toThrow('生成终态与当前任务不匹配')
  })
})
