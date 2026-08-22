<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '@/components/TopNav.vue'
import {
  deleteChapter,
  getChapter,
  retryChapterDerived,
  RetryChapterDerivedError,
  updateChapter,
  type ChapterDerivedSnapshot,
  type ChapterItem,
} from '@/utils/api'
import {
  derivedStatusClass,
  derivedStatusLabel,
  derivedTaskLabel,
  derivedTaskStatusLabel,
} from '@/utils/derivedState'

const route = useRoute()
const router = useRouter()

const chapterId = computed(() => String(route.params.chapterId ?? ''))

const item = ref<ChapterItem | null>(null)
const isLoading = ref(false)
const isSaving = ref(false)
const isRetryingDerived = ref(false)
const errorMessage = ref<string | null>(null)
const saveMessage = ref<string | null>(null)
const derivedRetryError = ref<string | null>(null)
const derivedRetryMessage = ref<string | null>(null)

const title = ref('')
const content = ref('')
const status = ref('Draft')
const order = ref<number | null>(null)

const abort = new AbortController()

async function refresh() {
  isLoading.value = true
  errorMessage.value = null
  saveMessage.value = null
  try {
    const res = await getChapter(chapterId.value, abort.signal)
    item.value = res.item
    title.value = res.item.title
    content.value = res.item.content
    status.value = res.item.status
    order.value = res.item.order
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    isLoading.value = false
  }
}

function applyDerivedSnapshot(snapshot: ChapterDerivedSnapshot) {
  if (!item.value) return
  item.value = {
    ...item.value,
    derived_status: snapshot.derived_status,
    derived_retryable: snapshot.derived_retryable,
    derived_tasks: snapshot.derived_tasks,
  }
}

async function onRetryDerived() {
  if (!item.value || isRetryingDerived.value || isSaving.value) return
  isRetryingDerived.value = true
  derivedRetryError.value = null
  derivedRetryMessage.value = null
  try {
    const snapshot = await retryChapterDerived(item.value.id, abort.signal)
    applyDerivedSnapshot(snapshot)
    derivedRetryMessage.value = '派生任务已全部完成'
  } catch (err) {
    if (err instanceof RetryChapterDerivedError) {
      applyDerivedSnapshot(err.snapshot)
      derivedRetryError.value = err.snapshot.error || err.message
    } else {
      derivedRetryError.value = err instanceof Error ? err.message : '派生任务重试失败'
    }
  } finally {
    isRetryingDerived.value = false
  }
}

async function onSave() {
  if (!item.value || isSaving.value || isRetryingDerived.value) return
  isSaving.value = true
  errorMessage.value = null
  saveMessage.value = null
  try {
    const payload = {
      title: title.value,
      content: content.value,
      status: status.value,
      order: order.value ?? undefined,
    }
    const res = await updateChapter(item.value.id, payload, abort.signal)
    item.value = res.item
    title.value = res.item.title
    content.value = res.item.content
    status.value = res.item.status
    order.value = res.item.order
    saveMessage.value = `已保存：${new Date(res.item.updated_at).toLocaleString()}`
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    isSaving.value = false
  }
}

async function onDelete() {
  if (!item.value || isSaving.value || isRetryingDerived.value) return
  const ok = window.confirm('确认删除该章节？删除后不可恢复。')
  if (!ok) return

  isSaving.value = true
  errorMessage.value = null
  saveMessage.value = null
  const targetNovelId = item.value.novel_id
  try {
    await deleteChapter(item.value.id, abort.signal)
    if (targetNovelId) {
      await router.push({ name: 'novel-reader', params: { novelId: targetNovelId } })
    } else {
      await router.push({ name: 'home' })
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '删除失败'
  } finally {
    isSaving.value = false
  }
}

function backToReader() {
  const novelId = item.value?.novel_id
  if (!novelId) {
    void router.push({ name: 'home' })
    return
  }
  void router.push({ name: 'novel-reader', params: { novelId } })
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
      <div class="mb-4">
        <div class="text-base font-semibold text-zinc-100">
          章节编辑
        </div>
        <div class="mt-1 text-xs text-zinc-400">
          chapter_id: {{ chapterId }}
        </div>
      </div>

      <div
        v-if="errorMessage"
        class="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4"
      >
        <div class="text-sm font-semibold text-red-200">
          操作失败
        </div>
        <div class="mt-1 break-words text-xs text-red-200/80">
          {{ errorMessage }}
        </div>
      </div>

      <div
        v-if="saveMessage"
        class="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4"
      >
        <div class="text-sm font-semibold text-emerald-200">
          保存成功
        </div>
        <div class="mt-1 break-words text-xs text-emerald-200/80">
          {{ saveMessage }}
        </div>
      </div>

      <div
        v-if="derivedRetryError"
        class="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4"
      >
        <div class="text-sm font-semibold text-red-200">
          派生任务重试失败
        </div>
        <div class="mt-1 break-words text-xs text-red-200/80">
          {{ derivedRetryError }}
        </div>
      </div>

      <div
        v-if="derivedRetryMessage"
        class="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4"
      >
        <div class="text-sm font-semibold text-emerald-200">
          {{ derivedRetryMessage }}
        </div>
      </div>

      <div
        v-if="isLoading"
        class="rounded-lg border border-zinc-800/60 bg-[#111A2E] p-6"
      >
        <div class="animate-pulse">
          <div class="h-5 w-56 rounded bg-zinc-800/60" />
          <div class="mt-3 h-3 w-80 rounded bg-zinc-800/60" />
        </div>
      </div>

      <div
        v-else-if="item"
        class="space-y-4"
      >
        <div class="rounded-lg border border-zinc-800/60 bg-[#111A2E] p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-zinc-100">
                派生任务
              </div>
              <div class="mt-1 text-xs text-zinc-400">
                记忆、角色与世界设定处理状态
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="rounded-md border px-2 py-1 text-[11px] font-semibold"
                :class="derivedStatusClass(item.derived_status)"
              >
                {{ derivedStatusLabel(item.derived_status) }}
              </span>
              <button
                v-if="item.derived_retryable"
                class="rounded-md border border-blue-400/60 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-100 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="isRetryingDerived || isSaving"
                type="button"
                @click="onRetryDerived"
              >
                {{ isRetryingDerived ? '重试中...' : '重试派生任务' }}
              </button>
            </div>
          </div>

          <div
            v-if="item.derived_tasks?.length"
            class="mt-4 grid gap-3 md:grid-cols-3"
          >
            <div
              v-for="task in item.derived_tasks"
              :key="task.handler_key"
              class="rounded-md border border-zinc-800/60 bg-zinc-900/20 p-3"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-semibold text-zinc-100">{{ derivedTaskLabel(task.handler_key) }}</span>
                <span class="text-[11px] text-zinc-400">{{ derivedTaskStatusLabel(task.status) }}</span>
              </div>
              <div class="mt-1 text-[11px] text-zinc-500">
                尝试 {{ task.attempts }} 次
              </div>
              <div
                v-if="task.last_error"
                class="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-[11px] text-red-200/80"
              >
                {{ task.last_error }}
              </div>
            </div>
          </div>
          <div
            v-else
            class="mt-4 text-xs text-zinc-500"
          >
            当前章节没有派生任务明细
          </div>
        </div>

        <div class="rounded-lg border border-zinc-800/60 bg-[#111A2E] p-6">
          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <div class="text-xs font-semibold text-zinc-200">
                标题
              </div>
              <input
                v-model="title"
                class="mt-2 w-full rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
                autocomplete="off"
              >
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <div class="text-xs font-semibold text-zinc-200">
                  序号
                </div>
                <input
                  v-model.number="order"
                  class="mt-2 w-full rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
                  type="number"
                  min="1"
                >
              </div>
              <div>
                <div class="text-xs font-semibold text-zinc-200">
                  状态
                </div>
                <select
                  v-model="status"
                  class="mt-2 w-full rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
                >
                  <option value="Draft">
                    Draft
                  </option>
                  <option value="Generating">
                    Generating
                  </option>
                  <option value="Reviewing">
                    Reviewing
                  </option>
                  <option value="Published">
                    Published
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div class="mt-4">
            <div class="text-xs font-semibold text-zinc-200">
              正文
            </div>
            <textarea
              v-model="content"
              class="mt-2 min-h-[520px] w-full resize-y rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
              placeholder="在这里编辑章节内容"
            />
          </div>

          <div class="mt-5 flex flex-wrap items-center gap-3">
            <button
              class="rounded-md bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="isSaving || isRetryingDerived"
              type="button"
              @click="onSave"
            >
              {{ isSaving ? '保存中...' : '保存' }}
            </button>

            <button
              class="rounded-md border border-zinc-700/60 bg-zinc-900/30 px-4 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="isRetryingDerived"
              type="button"
              @click="refresh"
            >
              重新加载
            </button>

            <button
              class="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="isSaving || isRetryingDerived"
              type="button"
              @click="onDelete"
            >
              删除章节
            </button>

            <button
              class="rounded-md border border-zinc-700/60 bg-zinc-900/30 px-4 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60"
              type="button"
              @click="backToReader"
            >
              返回阅读
            </button>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
            <span class="rounded bg-zinc-900/50 px-2 py-0.5">novel_id: {{ item.novel_id }}</span>
            <span class="rounded bg-zinc-900/50 px-2 py-0.5">字数: {{ item.word_count }}</span>
            <span class="rounded bg-zinc-900/50 px-2 py-0.5">更新: {{ new Date(item.updated_at).toLocaleString() }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
