<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '@/components/TopNav.vue'
import { createChapter, deleteChapter, getNovel, type ChapterItem, type NovelSummary } from '@/utils/api'

const route = useRoute()
const router = useRouter()

const novelId = computed(() => String(route.params.novelId ?? ''))

const item = ref<NovelSummary | null>(null)
const chapters = ref<ChapterItem[]>([])
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)

const viewMode = ref<'chapter' | 'full'>('chapter')
const activeChapterId = ref<string | null>(null)

const createLoading = ref(false)
const createError = ref<string | null>(null)
const deleteLoadingId = ref<string | null>(null)
const deleteError = ref<string | null>(null)

const abort = new AbortController()

const activeChapter = computed(() => {
  if (!activeChapterId.value) return null
  return chapters.value.find((c) => c.id === activeChapterId.value) ?? null
})

async function refresh() {
  isLoading.value = true
  errorMessage.value = null
  try {
    const res = await getNovel(novelId.value, abort.signal)
    item.value = res.item
    chapters.value = res.chapters
    if (res.chapters.length && !activeChapterId.value) {
      activeChapterId.value = res.chapters[0]?.id ?? null
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    isLoading.value = false
  }
}

async function onCreateChapter() {
  if (createLoading.value) return
  createError.value = null
  createLoading.value = true
  try {
    const res = await createChapter(novelId.value, {})
    await router.push({ name: 'chapter-edit', params: { chapterId: res.item.id } })
  } catch (err) {
    createError.value = err instanceof Error ? err.message : '新建章节失败'
  } finally {
    createLoading.value = false
  }
}

async function onDeleteChapter(chapter: ChapterItem) {
  if (deleteLoadingId.value) return
  const ok = window.confirm(`确认删除章节「${chapter.title || `第${chapter.order}章`}」？删除后不可恢复。`)
  if (!ok) return

  deleteError.value = null
  deleteLoadingId.value = chapter.id
  try {
    await deleteChapter(chapter.id, abort.signal)
    await refresh()
    if (activeChapterId.value === chapter.id) {
      activeChapterId.value = chapters.value[0]?.id ?? null
    }
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : '删除失败'
  } finally {
    deleteLoadingId.value = null
  }
}

onMounted(() => {
  void refresh()
})

onUnmounted(() => {
  abort.abort()
})
</script>

<template>
  <div class="min-h-screen bg-[#0B1220]">
    <TopNav title="AI Novel Studio" />

    <div class="mx-auto max-w-6xl px-4 py-6">
      <div v-if="errorMessage" class="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
        <div class="text-sm font-semibold text-red-200">加载失败</div>
        <div class="mt-1 break-words text-xs text-red-200/80">{{ errorMessage }}</div>
        <button
          class="mt-3 rounded-md bg-red-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-400"
          type="button"
          @click="refresh"
        >
          重试
        </button>
      </div>

      <div v-if="isLoading" class="rounded-lg border border-zinc-800/60 bg-[#111A2E] p-6">
        <div class="animate-pulse">
          <div class="h-5 w-64 rounded bg-zinc-800/60" />
          <div class="mt-3 h-3 w-80 rounded bg-zinc-800/60" />
        </div>
      </div>

      <div v-else-if="item" class="space-y-4">
        <div class="rounded-lg border border-zinc-800/60 bg-[#111A2E] p-6">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="truncate text-base font-semibold text-zinc-100">{{ item.title }}</div>
              <div v-if="item.description" class="mt-2 text-xs text-zinc-300/90">
                {{ item.description }}
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                <span class="rounded bg-zinc-900/50 px-2 py-0.5">ID: {{ item.id }}</span>
                <span class="rounded bg-zinc-900/50 px-2 py-0.5">{{ item.status }}</span>
                <span class="rounded bg-zinc-900/50 px-2 py-0.5">章节: {{ chapters.length }}</span>
                <span class="rounded bg-zinc-900/50 px-2 py-0.5">更新: {{ new Date(item.updated_at).toLocaleString() }}</span>
              </div>
              <div v-if="item.tags?.length" class="mt-3 flex flex-wrap gap-2">
                <span
                  v-for="t in item.tags"
                  :key="t"
                  class="rounded-md border border-zinc-700/60 bg-zinc-900/30 px-2 py-0.5 text-[11px] text-zinc-200"
                >
                  {{ t }}
                </span>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                class="rounded-md border px-3 py-2 text-xs font-semibold transition"
                :class="
                  viewMode === 'chapter'
                    ? 'border-blue-400/70 bg-blue-500/20 text-blue-100'
                    : 'border-zinc-700/60 bg-zinc-900/30 text-zinc-200 hover:bg-zinc-900/60'
                "
                type="button"
                @click="viewMode = 'chapter'"
              >
                单章阅读
              </button>
              <button
                class="rounded-md border px-3 py-2 text-xs font-semibold transition"
                :class="
                  viewMode === 'full'
                    ? 'border-blue-400/70 bg-blue-500/20 text-blue-100'
                    : 'border-zinc-700/60 bg-zinc-900/30 text-zinc-200 hover:bg-zinc-900/60'
                "
                type="button"
                @click="viewMode = 'full'"
              >
                全书阅读
              </button>

              <router-link
                class="rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60"
                :to="{ name: 'workbench', params: { novelId: item.id } }"
              >
                去工作台
              </router-link>

              <button
                class="rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="createLoading"
                type="button"
                @click="onCreateChapter"
              >
                {{ createLoading ? '创建中...' : '新建章节' }}
              </button>

              <router-link
                class="rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60"
                :to="{ name: 'home' }"
              >
                返回列表
              </router-link>
            </div>
          </div>

          <div v-if="createError" class="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            {{ createError }}
          </div>
          <div v-if="deleteError" class="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            {{ deleteError }}
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-3">
          <div class="rounded-lg border border-zinc-800/60 bg-[#111A2E] p-4 lg:col-span-1">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div class="text-sm font-semibold text-zinc-100">章节</div>
              <button
                class="rounded-md border border-zinc-700/60 bg-zinc-900/30 px-2 py-1 text-[11px] font-semibold text-zinc-100 transition hover:bg-zinc-900/60"
                type="button"
                @click="refresh"
              >
                刷新
              </button>
            </div>

            <div v-if="chapters.length === 0" class="text-xs text-zinc-400">暂无章节</div>

            <div v-else class="space-y-2">
              <button
                v-for="c in chapters"
                :key="c.id"
                class="w-full rounded-md border px-3 py-2 text-left text-xs transition"
                :class="
                  activeChapterId === c.id
                    ? 'border-blue-400/70 bg-blue-500/10 text-zinc-100'
                    : 'border-zinc-800/60 bg-zinc-900/20 text-zinc-200 hover:bg-zinc-900/40'
                "
                type="button"
                @click="activeChapterId = c.id"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="truncate font-semibold">{{ c.title || `第${c.order}章` }}</div>
                    <div class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                      <span>序号: {{ c.order }}</span>
                      <span>{{ c.status }}</span>
                      <span>{{ c.word_count }} 字</span>
                    </div>
                  </div>
                  <router-link
                    class="shrink-0 rounded-md border border-zinc-700/60 bg-zinc-900/30 px-2 py-1 text-[11px] font-semibold text-zinc-100 transition hover:bg-zinc-900/60"
                    :to="{ name: 'chapter-edit', params: { chapterId: c.id } }"
                    @click.stop
                  >
                    编辑
                  </router-link>
                  <button
                    class="shrink-0 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="deleteLoadingId === c.id"
                    type="button"
                    @click.stop="onDeleteChapter(c)"
                  >
                    {{ deleteLoadingId === c.id ? '删除中...' : '删除' }}
                  </button>
                </div>
              </button>
            </div>
          </div>

          <div class="rounded-lg border border-zinc-800/60 bg-[#111A2E] p-6 lg:col-span-2">
            <div v-if="viewMode === 'full'">
              <div class="text-sm font-semibold text-zinc-100">全书</div>
              <div class="mt-1 text-xs text-zinc-400">按章节顺序展示整本小说内容</div>
              <div v-if="chapters.length === 0" class="mt-4 text-xs text-zinc-400">暂无内容</div>
              <div v-else class="mt-4 space-y-6">
                <div v-for="c in chapters" :key="c.id" class="space-y-2">
                  <div class="text-sm font-semibold text-zinc-100">{{ c.title || `第${c.order}章` }}</div>
                  <div class="text-[11px] text-zinc-400">更新: {{ new Date(c.updated_at).toLocaleString() }}</div>
                  <div class="rounded-md border border-zinc-800/60 bg-zinc-900/20 p-4">
                    <pre class="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{{ c.content }}</pre>
                  </div>
                </div>
              </div>
            </div>

            <div v-else>
              <div class="text-sm font-semibold text-zinc-100">阅读</div>
              <div v-if="!activeChapter" class="mt-3 text-xs text-zinc-400">请选择一个章节</div>
              <div v-else class="mt-4 space-y-3">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div class="text-base font-semibold text-zinc-100">{{ activeChapter.title }}</div>
                    <div class="mt-1 text-xs text-zinc-400">
                      序号: {{ activeChapter.order }} · {{ activeChapter.word_count }} 字 · {{ activeChapter.status }}
                    </div>
                  </div>
                  <router-link
                    class="rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-400"
                    :to="{ name: 'chapter-edit', params: { chapterId: activeChapter.id } }"
                  >
                    编辑本章
                  </router-link>
                </div>
                <div class="rounded-md border border-zinc-800/60 bg-zinc-900/20 p-4">
                  <pre class="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{{ activeChapter.content }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
