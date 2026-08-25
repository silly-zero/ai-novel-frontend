import { describe, expect, it } from 'vitest'
import {
  reduceGenerationEvent,
  reduceGenerationTerminal,
} from './generationState'

function event(name: 'start' | 'context_meta' | 'token' | 'retry', data: unknown) {
  return { event: name, data: JSON.stringify(data) }
}

describe('reduceGenerationEvent', () => {
  it('handles start, context metadata, and ordered tokens', () => {
    const start = reduceGenerationEvent(
      event('start', { generation_id: 'generation-1', message: '准备中' }),
      'running',
      false,
    )
    expect(start).toEqual({ generationId: 'generation-1', status: '准备中' })

    const meta = reduceGenerationEvent(
      event('context_meta', { chapter_index: 2, chapter_id: null, context_stats: { context_lines: 4, scene_card_lines: 2 } }),
      'running',
      false,
    )
    expect(meta.meta).toEqual({ chapter_index: 2, chapter_id: null, context_stats: { context_lines: 4, scene_card_lines: 2 } })

    let output = ''
    for (const token of ['第一段', '第二段']) {
      const update = reduceGenerationEvent(event('token', { token }), 'running', false)
      output += update.appendToken
    }
    expect(output).toBe('第一段第二段')
  })

  it('clears the previous draft and exposes retry status', () => {
    const update = reduceGenerationEvent(
      event('retry', { retry_count: 2, critique: '补充冲突' }),
      'running',
      false,
    )
    expect(update).toEqual({
      clearOutput: true,
      status: '审查未通过，开始第 2 次重写',
      error: '重写原因：补充冲突',
    })
  })

  it('keeps cancelling status while clearing retry output', () => {
    const update = reduceGenerationEvent(
      event('retry', { retry_count: 2, critique: '补充冲突' }),
      'cancelling',
      true,
    )
    expect(update).toEqual({ clearOutput: true })
  })

  it('rejects malformed start, metadata, and token events', () => {
    expect(() => reduceGenerationEvent(event('start', {}), 'running', false)).toThrow(
      '生成开始事件缺少 generation_id',
    )
    expect(() => reduceGenerationEvent(event('context_meta', []), 'running', false)).toThrow(
      '生成上下文元数据格式无效',
    )
    expect(() => reduceGenerationEvent(event('token', { token: 1 }), 'running', false)).toThrow(
      '正文 Token 格式无效',
    )
  })
})

describe('reduceGenerationTerminal', () => {
  it('exposes the persisted chapter after success', () => {
    expect(reduceGenerationTerminal({
      generation_id: 'generation-1',
      status: 'success',
      chapter_id: '11',
      persisted: true,
    })).toEqual({
      state: 'success',
      status: '生成并保存完成',
      error: null,
      hasGenerated: true,
      persistedChapterId: '11',
    })
  })

  it('preserves the saved chapter when only derived processing fails', () => {
    expect(reduceGenerationTerminal({
      generation_id: 'generation-1',
      status: 'error',
      message: '派生失败',
      chapter_id: '11',
      persisted: true,
    })).toEqual({
      state: 'error',
      status: '正文已保存，派生处理未完成',
      error: '派生失败',
      hasGenerated: true,
      persistedChapterId: '11',
    })
  })

  it('keeps failed and cancelled generations out of persisted state', () => {
    expect(reduceGenerationTerminal({
      generation_id: 'generation-1',
      status: 'error',
      message: '模型断流',
    })).toEqual({
      state: 'error',
      status: '生成失败，正文未保存',
      error: '模型断流',
      hasGenerated: false,
      persistedChapterId: null,
    })
    expect(reduceGenerationTerminal({
      generation_id: 'generation-1',
      status: 'cancelled',
    })).toEqual({
      state: 'cancelled',
      status: '生成已取消，正文未保存',
      error: null,
      hasGenerated: false,
      persistedChapterId: null,
    })
  })
})
