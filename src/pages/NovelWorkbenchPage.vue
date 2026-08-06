<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '@/components/TopNav.vue'
import {
  APIResponseError,
  cancelGeneration,
  createChapter,
  getNovel,
  listChapters,
  previewContext,
  streamGenerateChapter,
  updateChapter,
  updateNovel,
} from '@/utils/api'
import type { ChapterItem, PreviewContextResponse, PreviewContextParams } from '@/utils/api'

const route = useRoute()
const router = useRouter()
const novelId = computed(() => String(route.params.novelId ?? ''))

const chapterIndex = ref(1)
const outlineStart = ref(1)
const outlineEnd = ref(10)
const idea = ref('')
const outline = ref('')
const editorNotes = ref('')
const manualContext = ref('')
const pacingPreset = ref<'normal' | 'slow-burn' | 'cliffhanger'>('slow-burn')

const preview = ref<PreviewContextResponse | null>(null)
const previewLoading = ref(false)
const previewError = ref<string | null>(null)

const meta = ref<Record<string, unknown> | null>(null)
const metaText = computed(() => (meta.value ? JSON.stringify(meta.value, null, 2) : ''))
const output = ref('')
type GenerationUIState = 'idle' | 'running' | 'cancelling' | 'success' | 'error' | 'cancelled'
const generationState = ref<GenerationUIState>('idle')
const isGenerationActive = computed(
  () => generationState.value === 'running' || generationState.value === 'cancelling',
)
const generateError = ref<string | null>(null)
const generateStatus = ref<string | null>(null)

const novelLoading = ref(false)
const novelError = ref<string | null>(null)
const isOutlineSaving = ref(false)
const outlineSaveMessage = ref<string | null>(null)
const lastSavedIdea = ref('')
const lastSavedOutline = ref('')
const outlineDirty = computed(() => idea.value !== lastSavedIdea.value || outline.value !== lastSavedOutline.value)

const savePanelOpen = ref(false)
const saveTargetMode = ref<'byIndex' | 'existing' | 'new'>('byIndex')
const saveChapters = ref<ChapterItem[]>([])
const saveChaptersLoading = ref(false)
const saveChaptersError = ref<string | null>(null)
const selectedChapterId = ref<string>('')
const saveGeneratedLoading = ref(false)
const saveGeneratedError = ref<string | null>(null)
const saveGeneratedMessage = ref<string | null>(null)
const savedChapterId = ref<string | null>(null)
const hasGenerated = ref(false)

const previewAbort = new AbortController()
const generateAbort = ref<AbortController | null>(null)
const generationId = ref<string | null>(null)
const generationNovelId = ref<string | null>(null)
const cancelRequested = ref(false)
const cancelInFlight = ref(false)

function buildChapterParams(): PreviewContextParams {
  const pacingHint =
    pacingPreset.value === 'slow-burn'
      ? '分章节奏要求：本章只推进一个阶段，不要在本章彻底解决核心事件，结尾保留明确悬念。'
      : pacingPreset.value === 'cliffhanger'
        ? '分章节奏要求：本章以强悬念结尾，核心冲突延续到下一章。'
        : ''
  const mergedEditorNotes = [pacingHint, editorNotes.value.trim()].filter(Boolean).join('\n')

  const base: PreviewContextParams = {
    novel_id: novelId.value,
    chapter_index: Math.max(1, Number(chapterIndex.value || 1)),
    editor_notes: mergedEditorNotes || undefined,
    manual_context: manualContext.value.trim() || undefined,
    persist: 0 as const,
  }
  base.idea = idea.value.trim() || undefined
  return base
}

function buildOutlineParams(): PreviewContextParams {
  const base: PreviewContextParams = {
    novel_id: novelId.value,
    chapter_index: 1,
    idea: idea.value.trim() || undefined,
    outline_start: Math.max(1, Number(outlineStart.value || 1)),
    outline_end: Math.max(1, Number(outlineEnd.value || 10)),
  }
  return base
}

async function savePreviewOutline() {
  if (!preview.value?.full_outline) return
  isOutlineSaving.value = true
  outlineSaveMessage.value = null
  try {
    await updateNovel(novelId.value, { outline: preview.value.full_outline })
    outline.value = preview.value.full_outline
    lastSavedOutline.value = preview.value.full_outline
    outlineSaveMessage.value = '大纲已从预览同步保存'
    setTimeout(() => {
      outlineSaveMessage.value = null
    }, 3000)
  } catch (err: unknown) {
    outlineSaveMessage.value = (err as Error).message || '保存大纲失败'
  } finally {
    isOutlineSaving.value = false
  }
}

async function onPreview() {
  if (previewLoading.value) return
  previewLoading.value = true
  previewError.value = null
  preview.value = null
  try {
    const params = buildChapterParams()
    if (!params.novel_id) throw new Error('novel_id 缺失')
    if (!idea.value.trim() && !outline.value.trim()) throw new Error('需要先填写 Idea 或保存全书大纲')
    preview.value = await previewContext(params, previewAbort.signal)
  } catch (err) {
    previewError.value = err instanceof Error ? err.message : '预览失败'
  } finally {
    previewLoading.value = false
  }
}

async function onExtendOutline() {
  if (previewLoading.value) return
  previewLoading.value = true
  previewError.value = null
  try {
    if (outlineDirty.value) {
      await saveOutline()
    }
    const params = buildOutlineParams()
    if (!params.novel_id) throw new Error('novel_id 缺失')
    if (!idea.value.trim() && !lastSavedIdea.value.trim()) throw new Error('需要先填写 Idea 才能生成/续写大纲')
    if (!params.outline_start || !params.outline_end) throw new Error('请填写大纲生成范围')
    if (params.outline_end < params.outline_start) throw new Error('结束章节不能小于起始章节')
    const res = await previewContext(params, previewAbort.signal)
    preview.value = res
    outline.value = res.full_outline
    outlineSaveMessage.value = '已生成/续写大纲（尚未保存），请点击“保存大纲”写入小说'
  } catch (err) {
    previewError.value = err instanceof Error ? err.message : '生成大纲失败'
  } finally {
    previewLoading.value = false
  }
}

async function requestGenerationCancel(controller: AbortController) {
  if (
    generateAbort.value !== controller ||
    !cancelRequested.value ||
    !generationId.value ||
    !generationNovelId.value ||
    cancelInFlight.value
  ) {
    return
  }

  cancelInFlight.value = true
  try {
    await cancelGeneration(generationNovelId.value, generationId.value)
  } catch (err) {
    if (generateAbort.value !== controller || generationState.value !== 'cancelling') return
    generateError.value = err instanceof Error ? err.message : '取消请求未确认，请等待生成连接返回终态'
    if (err instanceof APIResponseError) {
      generationState.value = 'running'
      cancelRequested.value = false
      generateStatus.value = '取消请求被后端拒绝，可重试停止'
      return
    }
    generateStatus.value = '正在取消，等待后端确认'
  } finally {
    if (generateAbort.value === controller) {
      cancelInFlight.value = false
    }
  }
}

function stopGenerate() {
  const controller = generateAbort.value
  if (!controller || generationState.value !== 'running') return
  generationState.value = 'cancelling'
  cancelRequested.value = true
  generateStatus.value = '正在取消'
  generateError.value = null
  void requestGenerationCancel(controller)
}

function abortGenerationTransport() {
  generateAbort.value?.abort()
  generateAbort.value = null
}

function clearOutput() {
  output.value = ''
  meta.value = null
  generateError.value = null
  generateStatus.value = null
  hasGenerated.value = false
  savePanelOpen.value = false
  saveGeneratedError.value = null
  saveGeneratedMessage.value = null
  savedChapterId.value = null
}

async function loadNovel() {
  novelLoading.value = true
  novelError.value = null
  try {
    const res = await getNovel(novelId.value, previewAbort.signal)
    idea.value = res.item.idea ?? ''
    outline.value = res.item.outline ?? ''
    lastSavedIdea.value = idea.value
    lastSavedOutline.value = outline.value
  } catch (err) {
    novelError.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    novelLoading.value = false
  }
}

async function saveOutline() {
  if (isOutlineSaving.value) return
  isOutlineSaving.value = true
  outlineSaveMessage.value = null
  try {
    const res = await updateNovel(
      novelId.value,
      {
        idea: idea.value,
        outline: outline.value,
      },
      previewAbort.signal,
    )
    lastSavedIdea.value = res.item.idea ?? ''
    lastSavedOutline.value = res.item.outline ?? ''
    outlineSaveMessage.value = `已保存：${new Date(res.item.updated_at).toLocaleString()}`
  } catch (err) {
    outlineSaveMessage.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    isOutlineSaving.value = false
  }
}
async function loadSaveChapters() {
  saveChaptersLoading.value = true
  saveChaptersError.value = null
  try {
    const res = await listChapters(novelId.value, previewAbort.signal)
    saveChapters.value = res.items
    if (!selectedChapterId.value && res.items.length) {
      selectedChapterId.value = res.items[0]?.id ?? ''
    }
  } catch (err) {
    saveChaptersError.value = err instanceof Error ? err.message : '章节加载失败'
  } finally {
    saveChaptersLoading.value = false
  }
}

async function saveGeneratedToChapter() {
  if (saveGeneratedLoading.value) return
  saveGeneratedError.value = null
  saveGeneratedMessage.value = null
  savedChapterId.value = null

  const text = output.value
  if (!text.trim()) {
    saveGeneratedError.value = '没有可保存的生成内容'
    return
  }

  saveGeneratedLoading.value = true
  try {
    if (saveTargetMode.value === 'existing') {
      if (!selectedChapterId.value) {
        throw new Error('请选择要保存的章节')
      }
      const ok = window.confirm('确认覆盖该章节内容？')
      if (!ok) return
      const res = await updateChapter(
        selectedChapterId.value,
        {
          content: text,
          status: 'Draft',
        },
        previewAbort.signal,
      )
      savedChapterId.value = res.item.id
    } else if (saveTargetMode.value === 'byIndex') {
      await loadSaveChapters()
      const idx = Math.max(1, Number(chapterIndex.value || 1))
      const found = saveChapters.value.find((c) => c.order === idx)
      if (found) {
        const ok = window.confirm('确认覆盖该章节内容？')
        if (!ok) return
        const res = await updateChapter(
          found.id,
          {
            content: text,
            status: 'Draft',
          },
          previewAbort.signal,
        )
        savedChapterId.value = res.item.id
      } else {
        const res = await createChapter(
          novelId.value,
          {
            order: idx,
            title: `第${idx}章`,
            content: text,
            status: 'Draft',
          },
          previewAbort.signal,
        )
        savedChapterId.value = res.item.id
      }
    } else {
      const res = await createChapter(
        novelId.value,
        {
          title: '',
          content: text,
          status: 'Draft',
        },
        previewAbort.signal,
      )
      savedChapterId.value = res.item.id
    }

    saveGeneratedMessage.value = '已保存到章节'
  } catch (err) {
    saveGeneratedError.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    saveGeneratedLoading.value = false
  }
}

function goEditSavedChapter() {
  if (!savedChapterId.value) return
  void router.push({ name: 'chapter-edit', params: { chapterId: savedChapterId.value } })
}


async function onGenerate() {
  if (isGenerationActive.value) return
  generateError.value = null
  generateStatus.value = null
  meta.value = null

  const params = buildChapterParams()
  if (!params.novel_id) {
    generateError.value = 'novel_id 缺失'
    return
  }
  if (!idea.value.trim() && !outline.value.trim()) {
    generateError.value = '需要先填写 Idea 或保存全书大纲'
    return
  }

  abortGenerationTransport()
  output.value = ''
  generationState.value = 'running'
  generationId.value = null
  generationNovelId.value = params.novel_id
  cancelRequested.value = false
  cancelInFlight.value = false
  hasGenerated.value = false
  savePanelOpen.value = false

  const controller = new AbortController()
  generateAbort.value = controller

  try {
    const terminal = await streamGenerateChapter(params, controller.signal, ({ event, data }) => {
      if (generateAbort.value !== controller) return
      if (event === 'start') {
        const parsed = JSON.parse(data || '{}') as { generation_id?: string; message?: string }
        if (!parsed.generation_id) throw new Error('生成开始事件缺少 generation_id')
        generationId.value = parsed.generation_id
        generateStatus.value = cancelRequested.value ? '正在取消' : parsed.message || '已开始生成'
        void requestGenerationCancel(controller)
        return
      }
      if (event === 'context_meta') {
        meta.value = JSON.parse(data || '{}') as Record<string, unknown>
        return
      }
      if (event === 'retry') {
        const parsed = JSON.parse(data || '{}') as { retry_count?: number; critique?: string }
        output.value = ''
        if (generationState.value !== 'cancelling') {
          const idx = parsed.retry_count ?? 1
          generateStatus.value = `审查未通过，开始第 ${idx} 次重写`
          generateError.value = parsed.critique ? `重写原因：${parsed.critique}` : null
        }
        return
      }
      if (event === 'token') {
        const parsed = JSON.parse(data || '{}') as { token?: unknown }
        if (typeof parsed.token !== 'string') {
          throw new Error('正文 Token 格式无效')
        }
        output.value += parsed.token
      }
    })

    if (generateAbort.value !== controller) return
    generationState.value = terminal.status
    generateStatus.value =
      terminal.status === 'success'
        ? '生成完成'
        : terminal.status === 'cancelled'
          ? '生成已取消'
          : '生成失败'
    generateError.value = terminal.status === 'error' ? terminal.message || '生成失败' : null
    if (terminal.status === 'success') {
      hasGenerated.value = true
      savePanelOpen.value = true
    }
  } catch (err) {
    if (generateAbort.value !== controller) return
    if (err instanceof DOMException && err.name === 'AbortError') {
      return
    }
    generationState.value = 'error'
    generateStatus.value = '生成连接异常'
    generateError.value = err instanceof Error ? err.message : '生成失败'
  } finally {
    if (generateAbort.value === controller) {
      generateAbort.value = null
      generationId.value = null
      generationNovelId.value = null
      cancelRequested.value = false
      cancelInFlight.value = false
    }
  }
}

onUnmounted(() => {
  previewAbort.abort()
  abortGenerationTransport()
})

onMounted(() => {
  void loadNovel()
})
</script>

<template>
  <div class="min-h-screen bg-[#0B1220]">
    <TopNav title="AI Novel Studio" />

    <div class="mx-auto max-w-6xl px-4 py-6">
      <div class="mb-4">
        <div class="text-base font-semibold text-zinc-100">创作工作台</div>
        <div class="mt-1 text-xs text-zinc-400">novel_id: {{ novelId }}</div>
      </div>

      <div class="mb-4 rounded-lg border border-zinc-800/60 bg-[#111A2E] p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="text-sm font-semibold text-zinc-100">全书大纲</div>
            <div class="mt-1 text-xs text-zinc-400">建议先生成/编辑大纲，再生成章节</div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="rounded border px-2 py-0.5 text-[11px]"
              :class="outlineDirty ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'"
            >
              {{ outlineDirty ? '未保存' : '已保存' }}
            </span>
            <button
              class="rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="isOutlineSaving || !outlineDirty"
              type="button"
              @click="saveOutline"
            >
              {{ isOutlineSaving ? '保存中...' : '保存大纲' }}
            </button>
            <button
              class="rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="novelLoading"
              type="button"
              @click="loadNovel"
            >
              {{ novelLoading ? '加载中...' : '重新加载' }}
            </button>
          </div>
        </div>

        <div v-if="outlineSaveMessage" class="mt-3 text-[11px] text-zinc-300">{{ outlineSaveMessage }}</div>
        <div v-if="novelError" class="mt-2 text-[11px] text-red-200/80">{{ novelError }}</div>

        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <div class="text-xs font-semibold text-zinc-200">Idea（小说核心设定）</div>
            <textarea
              v-model="idea"
              class="mt-2 min-h-28 w-full resize-y rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
              placeholder="一句话或一段话描述故事核心设定"
            />
            <div class="mt-3 flex items-center gap-2">
              <span class="text-xs text-zinc-400">大纲生成范围：</span>
              <div class="flex items-center gap-1 text-xs">
                <span class="text-zinc-400">第</span>
                <input
                  v-model.number="outlineStart"
                  type="number"
                  min="1"
                  class="w-14 rounded border border-zinc-700/60 bg-zinc-900/30 px-1 py-1 text-center text-zinc-100 outline-none focus:border-blue-400/70"
                >
                <span class="text-zinc-400">到</span>
                <input
                  v-model.number="outlineEnd"
                  type="number"
                  min="1"
                  class="w-14 rounded border border-zinc-700/60 bg-zinc-900/30 px-1 py-1 text-center text-zinc-100 outline-none focus:border-blue-400/70"
                >
                <span class="text-zinc-400">章</span>
              </div>
              <button
                class="rounded-md border border-blue-400/70 bg-blue-500/20 px-3 py-2 text-xs font-semibold text-blue-100 transition hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="previewLoading"
                type="button"
                @click="onExtendOutline"
              >
                {{ previewLoading ? '生成中...' : '生成/续写大纲' }}
              </button>
            </div>
          </div>

          <div>
            <div class="text-xs font-semibold text-zinc-200">Full Outline（可编辑）</div>
            <textarea
              v-model="outline"
              class="mt-2 min-h-64 w-full resize-y rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
              placeholder="这里存放全书大纲；章节多时建议在此编辑、搜索"
            />
          </div>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="space-y-4">
          <div class="rounded-lg border border-zinc-800/60 bg-[#111A2E] p-6">
            <div class="text-sm font-semibold text-zinc-100">输入</div>

            <div class="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div class="text-xs font-semibold text-zinc-200">章节序号</div>
                <input
                  v-model.number="chapterIndex"
                  class="mt-2 w-full rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
                  type="number"
                  min="1"
                >
              </div>

              <div class="flex items-end justify-between gap-3">
                <router-link
                  class="inline-flex w-full items-center justify-center rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60"
                  :to="{ name: 'novel-reader', params: { novelId } }"
                >
                  阅读整本
                </router-link>
                <router-link
                  class="inline-flex w-full items-center justify-center rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60"
                  :to="{ name: 'home' }"
                >
                  返回列表
                </router-link>
              </div>
            </div>

            <div class="mt-4">
              <div class="text-xs font-semibold text-zinc-200">本章推进节奏</div>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  class="rounded-md border px-3 py-1.5 text-xs font-semibold transition"
                  :class="
                    pacingPreset === 'slow-burn'
                      ? 'border-blue-400/70 bg-blue-500/20 text-blue-100'
                      : 'border-zinc-700/60 bg-zinc-900/30 text-zinc-200 hover:bg-zinc-900/60'
                  "
                  type="button"
                  @click="pacingPreset = 'slow-burn'"
                >
                  慢推进（推荐）
                </button>
                <button
                  class="rounded-md border px-3 py-1.5 text-xs font-semibold transition"
                  :class="
                    pacingPreset === 'cliffhanger'
                      ? 'border-blue-400/70 bg-blue-500/20 text-blue-100'
                      : 'border-zinc-700/60 bg-zinc-900/30 text-zinc-200 hover:bg-zinc-900/60'
                  "
                  type="button"
                  @click="pacingPreset = 'cliffhanger'"
                >
                  强悬念结尾
                </button>
                <button
                  class="rounded-md border px-3 py-1.5 text-xs font-semibold transition"
                  :class="
                    pacingPreset === 'normal'
                      ? 'border-blue-400/70 bg-blue-500/20 text-blue-100'
                      : 'border-zinc-700/60 bg-zinc-900/30 text-zinc-200 hover:bg-zinc-900/60'
                  "
                  type="button"
                  @click="pacingPreset = 'normal'"
                >
                  普通
                </button>
              </div>
            </div>

            <div class="mt-4">
              <div class="text-xs font-semibold text-zinc-200">编辑备注（可选）</div>
              <textarea
                v-model="editorNotes"
                class="mt-2 min-h-20 w-full resize-y rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
                placeholder="例如：语气更克制、节奏更快、减少旁白"
              />
            </div>

            <div class="mt-4">
              <div class="text-xs font-semibold text-zinc-200">手工上下文（可选）</div>
              <textarea
                v-model="manualContext"
                class="mt-2 min-h-20 w-full resize-y rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
                placeholder="例如：上一章关键剧情、人物关系补充"
              />
              <div class="mt-2 text-[11px] text-zinc-400">
                当前后端以 query 参数接收上下文，内容过长可能会触发 URL 长度限制
              </div>
            </div>

            <div class="mt-5 flex flex-wrap items-center gap-3">
              <button
                class="inline-flex items-center justify-center rounded-md border border-zinc-700/60 bg-zinc-900/30 px-4 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="previewLoading"
                type="button"
                @click="onPreview"
              >
                {{ previewLoading ? '预览中...' : '预览上下文' }}
              </button>

              <button
                class="inline-flex items-center justify-center rounded-md bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="isGenerationActive"
                type="button"
                @click="onGenerate"
              >
                {{ isGenerationActive ? (generationState === 'cancelling' ? '正在取消...' : '生成中...') : '开始生成章节' }}
              </button>

              <button
                class="inline-flex items-center justify-center rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="generationState !== 'running'"
                type="button"
                @click="stopGenerate"
              >
                {{ generationState === 'cancelling' ? '正在取消...' : '停止' }}
              </button>

              <button
                class="inline-flex items-center justify-center rounded-md border border-zinc-700/60 bg-zinc-900/30 px-4 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="isGenerationActive"
                type="button"
                @click="clearOutput"
              >
                清空输出
              </button>
            </div>
          </div>

          <div class="rounded-lg border border-zinc-800/60 bg-[#111A2E] p-6">
            <div class="text-sm font-semibold text-zinc-100">生成输出</div>

            <div v-if="generateStatus" class="mt-2 text-xs text-zinc-400">{{ generateStatus }}</div>
            <div v-if="generateError" class="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              {{ generateError }}
            </div>

            <textarea
              v-model="output"
              class="mt-4 min-h-80 w-full resize-y rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
              placeholder="这里会实时显示 SSE 输出"
            />

            <div v-if="savePanelOpen" class="mt-4 rounded-md border border-zinc-700/60 bg-zinc-900/20 p-4">
              <div class="text-xs font-semibold text-zinc-200">保存本次生成到章节</div>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <button
                  class="rounded-md border px-3 py-1.5 text-xs font-semibold transition"
                  :class="
                    saveTargetMode === 'byIndex'
                      ? 'border-blue-400/70 bg-blue-500/20 text-blue-100'
                      : 'border-zinc-700/60 bg-zinc-900/30 text-zinc-200 hover:bg-zinc-900/60'
                  "
                  type="button"
                  @click="saveTargetMode = 'byIndex'"
                >
                  按章节序号
                </button>
                <button
                  class="rounded-md border px-3 py-1.5 text-xs font-semibold transition"
                  :class="
                    saveTargetMode === 'existing'
                      ? 'border-blue-400/70 bg-blue-500/20 text-blue-100'
                      : 'border-zinc-700/60 bg-zinc-900/30 text-zinc-200 hover:bg-zinc-900/60'
                  "
                  type="button"
                  @click="
                    saveTargetMode = 'existing';
                    void loadSaveChapters();
                  "
                >
                  覆盖已有章节
                </button>
                <button
                  class="rounded-md border px-3 py-1.5 text-xs font-semibold transition"
                  :class="
                    saveTargetMode === 'new'
                      ? 'border-blue-400/70 bg-blue-500/20 text-blue-100'
                      : 'border-zinc-700/60 bg-zinc-900/30 text-zinc-200 hover:bg-zinc-900/60'
                  "
                  type="button"
                  @click="saveTargetMode = 'new'"
                >
                  新建章节
                </button>
              </div>

              <div v-if="saveTargetMode === 'byIndex'" class="mt-2 text-[11px] text-zinc-400">
                保存到当前章节序号对应章节；若不存在会自动创建。
              </div>

              <div v-else-if="saveTargetMode === 'existing'" class="mt-3">
                <div class="flex flex-wrap items-center gap-2">
                  <select
                    v-model="selectedChapterId"
                    class="w-full rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70 md:w-auto"
                    :disabled="saveChaptersLoading"
                  >
                    <option v-for="c in saveChapters" :key="c.id" :value="c.id">
                      {{ c.title || `第${c.order}章` }}
                    </option>
                  </select>
                  <button
                    class="rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="saveChaptersLoading"
                    type="button"
                    @click="loadSaveChapters"
                  >
                    {{ saveChaptersLoading ? '加载中...' : '刷新章节' }}
                  </button>
                </div>
                <div v-if="saveChaptersError" class="mt-2 text-[11px] text-red-200/80">{{ saveChaptersError }}</div>
                <div v-else-if="saveChapters.length === 0" class="mt-2 text-[11px] text-zinc-400">当前小说还没有章节。</div>
              </div>

              <div v-if="saveGeneratedError" class="mt-3 text-[11px] text-red-200/80">{{ saveGeneratedError }}</div>
              <div v-if="saveGeneratedMessage" class="mt-3 text-[11px] text-emerald-200/80">{{ saveGeneratedMessage }}</div>

              <div class="mt-3 flex flex-wrap items-center gap-2">
                <button
                  class="rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="saveGeneratedLoading"
                  type="button"
                  @click="saveGeneratedToChapter"
                >
                  {{ saveGeneratedLoading ? '保存中...' : '保存到章节' }}
                </button>
                <button
                  v-if="savedChapterId"
                  class="rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60"
                  type="button"
                  @click="goEditSavedChapter"
                >
                  去编辑
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <div class="rounded-lg border border-zinc-800/60 bg-[#111A2E] p-6">
            <div class="text-sm font-semibold text-zinc-100">上下文预览</div>

            <div v-if="previewError" class="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              {{ previewError }}
            </div>

            <div v-else-if="!preview" class="mt-3 text-xs text-zinc-400">点击“预览上下文”生成场景卡与共创上下文。</div>

            <div v-else class="mt-4 space-y-4">
              <div v-if="meta" class="rounded-md border border-zinc-700/60 bg-zinc-900/20 p-3">
                <div class="text-xs font-semibold text-zinc-200">生成元信息</div>
                <pre
                  class="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11px] text-zinc-300"
                >{{ metaText }}</pre>
              </div>

              <div>
                <div class="text-xs font-semibold text-zinc-200">Full Outline</div>
                <textarea
                  v-model="preview.full_outline"
                  class="mt-2 min-h-32 w-full resize-y rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
                />
                <div class="mt-2 flex items-center gap-2">
                  <button
                    class="rounded-md border border-blue-400/70 bg-blue-500/20 px-3 py-1.5 text-[11px] font-semibold text-blue-100 transition hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="isOutlineSaving"
                    type="button"
                    @click="savePreviewOutline"
                  >
                    {{ isOutlineSaving ? '保存中...' : '将此大纲保存到小说' }}
                  </button>
                  <span v-if="outlineSaveMessage" class="text-[11px] text-emerald-400/90">{{ outlineSaveMessage }}</span>
                </div>
              </div>

              <div>
                <div class="text-xs font-semibold text-zinc-200">Scene Card</div>
                <textarea
                  :value="preview.scene_card"
                  class="mt-2 min-h-40 w-full resize-y rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
                  readonly
                />
              </div>

              <div>
                <div class="text-xs font-semibold text-zinc-200">Context</div>
                <textarea
                  :value="preview.context"
                  class="mt-2 min-h-56 w-full resize-y rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
                  readonly
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
