<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '@/components/TopNav.vue'
import { buildGenerateChapterUrl, createChapter, getNovel, listChapters, previewContext, updateChapter, updateNovel } from '@/utils/api'
import type { ChapterItem, PreviewContextResponse, PreviewContextParams } from '@/utils/api'

const route = useRoute()
const router = useRouter()
const novelId = computed(() => String(route.params.novelId ?? ''))

const inputMode = ref<'idea' | 'outline'>('idea')
const chapterIndex = ref(1)
const outlineStart = ref(1)
const outlineEnd = ref(10)
const idea = ref('')
const outline = ref('')
const editorNotes = ref('')
const manualContext = ref('')

const preview = ref<PreviewContextResponse | null>(null)
const previewLoading = ref(false)
const previewError = ref<string | null>(null)

const meta = ref<Record<string, unknown> | null>(null)
const metaText = computed(() => (meta.value ? JSON.stringify(meta.value, null, 2) : ''))
const output = ref('')
const isGenerating = ref(false)
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
const esRef = ref<EventSource | null>(null)

function buildParams(): PreviewContextParams {
  const base: PreviewContextParams = {
    novel_id: novelId.value,
    chapter_index: Math.max(1, Number(chapterIndex.value || 1)),
    editor_notes: editorNotes.value.trim() || undefined,
    manual_context: manualContext.value.trim() || undefined,
    persist: 0 as const,
  }
  if (inputMode.value === 'idea') {
    base.idea = idea.value.trim() || undefined
    if (outline.value.trim()) {
      base.existing_outline = outline.value.trim() || undefined
    }
    base.outline_start = outlineStart.value
    base.outline_end = outlineEnd.value
  } else {
    base.outline = outline.value.trim() || undefined
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
  previewLoading.value = true
  previewError.value = null
  preview.value = null
  try {
    const params = buildParams()
    if (!params.novel_id) throw new Error('novel_id 缺失')
    if (!params.idea && !params.outline) throw new Error('需要填写 idea 或 outline')
    preview.value = await previewContext(params, previewAbort.signal)
  } catch (err) {
    previewError.value = err instanceof Error ? err.message : '预览失败'
  } finally {
    previewLoading.value = false
  }
}

function stopGenerate() {
  if (esRef.value) {
    esRef.value.close()
    esRef.value = null
  }
  isGenerating.value = false
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


function onGenerate() {
  generateError.value = null
  generateStatus.value = null
  meta.value = null

  const params = buildParams()
  if (!params.novel_id) {
    generateError.value = 'novel_id 缺失'
    return
  }
  if (!params.idea && !params.outline) {
    generateError.value = '需要填写 idea 或 outline'
    return
  }

  stopGenerate()
  output.value = ''
  isGenerating.value = true
  hasGenerated.value = false
  savePanelOpen.value = false

  const es = new EventSource(buildGenerateChapterUrl(params))
  esRef.value = es

  es.addEventListener('start', (e) => {
    const data = e instanceof MessageEvent ? String(e.data ?? '') : ''
    generateStatus.value = data || '已开始生成'
  })

  es.addEventListener('context_meta', (e) => {
    try {
      meta.value = JSON.parse(String((e as MessageEvent).data ?? '{}')) as Record<string, unknown>
    } catch {
      meta.value = null
    }
  })

  es.addEventListener('end', () => {
    generateStatus.value = '生成完成'
    stopGenerate()
    hasGenerated.value = true
    savePanelOpen.value = true
  })

  es.addEventListener('error', (e) => {
    const data = e instanceof MessageEvent ? String(e.data ?? '') : ''
    generateError.value = data || '生成失败'
    stopGenerate()
  })

  es.onmessage = (e) => {
    try {
      const parsed = JSON.parse(String(e.data ?? '{}')) as { token?: string }
      if (parsed.token) output.value += parsed.token
    } catch {
      return
    }
  }
}

onUnmounted(() => {
  previewAbort.abort()
  stopGenerate()
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

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="space-y-4">
          <div class="rounded-lg border border-zinc-800/60 bg-[#111A2E] p-6">
            <div class="text-sm font-semibold text-zinc-100">输入</div>

            <div class="mt-4 flex flex-wrap items-center gap-2">
              <button
                class="rounded-md border px-3 py-1.5 text-xs font-semibold transition"
                :class="
                  inputMode === 'idea'
                    ? 'border-blue-400/70 bg-blue-500/20 text-blue-100'
                    : 'border-zinc-700/60 bg-zinc-900/30 text-zinc-200 hover:bg-zinc-900/60'
                "
                type="button"
                @click="inputMode = 'idea'"
              >
                用 idea
              </button>
              <button
                class="rounded-md border px-3 py-1.5 text-xs font-semibold transition"
                :class="
                  inputMode === 'outline'
                    ? 'border-blue-400/70 bg-blue-500/20 text-blue-100'
                    : 'border-zinc-700/60 bg-zinc-900/30 text-zinc-200 hover:bg-zinc-900/60'
                "
                type="button"
                @click="inputMode = 'outline'"
              >
                用 outline
              </button>
            </div>

            <div class="mt-4">
              <div class="text-xs font-semibold text-zinc-200">大纲/方向</div>
              <div v-if="novelError" class="mt-2 text-[11px] text-red-200/80">{{ novelError }}</div>
              <div v-else class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                <span
                  class="rounded border px-2 py-0.5"
                  :class="outlineDirty ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'"
                >
                  {{ outlineDirty ? '未保存' : '已保存' }}
                </span>
                <span class="rounded bg-zinc-900/50 px-2 py-0.5">提示：生成后可再选择是否保存到章节</span>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2">
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
                <div v-if="outlineSaveMessage" class="text-[11px] text-zinc-300">{{ outlineSaveMessage }}</div>
              </div>
            </div>

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

            <div v-if="inputMode === 'idea'" class="mt-4">
              <div class="text-xs font-semibold text-zinc-200">Idea</div>
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
                    type="number"
                    v-model.number="outlineStart"
                    class="w-14 rounded border border-zinc-700/60 bg-zinc-900/30 px-1 py-1 text-center text-zinc-100 outline-none focus:border-blue-400/70"
                    min="1"
                  />
                  <span class="text-zinc-400">到</span>
                  <input
                    type="number"
                    v-model.number="outlineEnd"
                    class="w-14 rounded border border-zinc-700/60 bg-zinc-900/30 px-1 py-1 text-center text-zinc-100 outline-none focus:border-blue-400/70"
                    min="1"
                  />
                  <span class="text-zinc-400">章</span>
                </div>
              </div>
            </div>

            <div v-else class="mt-4">
              <div class="text-xs font-semibold text-zinc-200">Outline</div>
              <textarea
                v-model="outline"
                class="mt-2 min-h-28 w-full resize-y rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
                placeholder="输入大纲（可多段）"
              />
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
                :disabled="isGenerating"
                type="button"
                @click="onGenerate"
              >
                {{ isGenerating ? '生成中...' : '开始生成章节' }}
              </button>

              <button
                class="inline-flex items-center justify-center rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="!isGenerating"
                type="button"
                @click="stopGenerate"
              >
                停止
              </button>

              <button
                class="inline-flex items-center justify-center rounded-md border border-zinc-700/60 bg-zinc-900/30 px-4 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60"
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
