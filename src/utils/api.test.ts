import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamGenerateChapter } from './api'

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
