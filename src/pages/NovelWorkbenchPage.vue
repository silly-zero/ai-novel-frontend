<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import TopNav from '@/components/TopNav.vue'
import { buildGenerateChapterUrl, listChapters, previewContext, type ChapterItem, type PreviewContextResponse } from '@/utils/api'

const route = useRoute()
const novelId = computed(() => String(route.params.novelId ?? ''))

const inputMode = ref<'idea' | 'outline'>('idea')
const chapterIndex = ref(1)
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

const saveMode = ref<'none' | 'byIndex' | 'existing'>('none')
const chapters = ref<ChapterItem[]>([])
const chaptersError = ref<string | null>(null)
const selectedChapterId = ref<string>('')

const previewAbort = new AbortController()
const esRef = ref<EventSource | null>(null)

function buildParams() {
  const base = {
    novel_id: novelId.value,
    chapter_index: Math.max(1, Number(chapterIndex.value || 1)),
    editor_notes: editorNotes.value.trim() || undefined,
    manual_context: manualContext.value.trim() || undefined,
    persist: saveMode.value === 'none' ? (0 as const) : (1 as const),
    chapter_id: saveMode.value === 'existing' && selectedChapterId.value ? selectedChapterId.value : undefined,
  }
  if (inputMode.value === 'idea') {
    return {
      ...base,
      idea: idea.value.trim() || undefined,
      outline: undefined,
    }
  }
  return {
    ...base,
    outline: outline.value.trim() || undefined,
    idea: undefined,
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
}

async function loadChapters() {
  chaptersError.value = null
  try {
    const res = await listChapters(novelId.value, previewAbort.signal)
    chapters.value = res.items
    if (!selectedChapterId.value && res.items.length) {
      selectedChapterId.value = res.items[0]?.id ?? ''
    }
  } catch (err) {
    chaptersError.value = err instanceof Error ? err.message : '章节加载失败'
  }
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
  if (saveMode.value === 'existing' && !params.chapter_id) {
    generateError.value = '请选择要保存的章节'
    return
  }

  stopGenerate()
  output.value = ''
  isGenerating.value = true

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

void loadChapters()
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
              <div class="text-xs font-semibold text-zinc-200">生成结果保存</div>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <button
                  class="rounded-md border px-3 py-1.5 text-xs font-semibold transition"
                  :class="
                    saveMode === 'none'
                      ? 'border-blue-400/70 bg-blue-500/20 text-blue-100'
                      : 'border-zinc-700/60 bg-zinc-900/30 text-zinc-200 hover:bg-zinc-900/60'
                  "
                  type="button"
                  @click="saveMode = 'none'"
                >
                  不保存
                </button>
                <button
                  class="rounded-md border px-3 py-1.5 text-xs font-semibold transition"
                  :class="
                    saveMode === 'byIndex'
                      ? 'border-blue-400/70 bg-blue-500/20 text-blue-100'
                      : 'border-zinc-700/60 bg-zinc-900/30 text-zinc-200 hover:bg-zinc-900/60'
                  "
                  type="button"
                  @click="saveMode = 'byIndex'"
                >
                  按章节序号保存
                </button>
                <button
                  class="rounded-md border px-3 py-1.5 text-xs font-semibold transition"
                  :class="
                    saveMode === 'existing'
                      ? 'border-blue-400/70 bg-blue-500/20 text-blue-100'
                      : 'border-zinc-700/60 bg-zinc-900/30 text-zinc-200 hover:bg-zinc-900/60'
                  "
                  type="button"
                  @click="
                    saveMode = 'existing';
                    void loadChapters();
                  "
                >
                  保存到已有章节
                </button>
              </div>

              <div v-if="saveMode === 'byIndex'" class="mt-2 text-[11px] text-zinc-400">
                将保存到当前章节序号对应的章节（不存在会自动创建）。
              </div>

              <div v-else-if="saveMode === 'existing'" class="mt-3">
                <div class="flex flex-wrap items-center gap-2">
                  <select
                    v-model="selectedChapterId"
                    class="w-full rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70 md:w-auto"
                  >
                    <option v-for="c in chapters" :key="c.id" :value="c.id">
                      {{ c.title || `第${c.order}章` }}
                    </option>
                  </select>
                  <button
                    class="rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60"
                    type="button"
                    @click="loadChapters"
                  >
                    刷新章节
                  </button>
                </div>
                <div v-if="chaptersError" class="mt-2 text-[11px] text-red-200/80">{{ chaptersError }}</div>
                <div v-else-if="chapters.length === 0" class="mt-2 text-[11px] text-zinc-400">当前小说还没有章节。</div>
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
                  :value="preview.full_outline"
                  class="mt-2 min-h-32 w-full resize-y rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
                  readonly
                />
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
