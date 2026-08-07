<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import TopNav from '@/components/TopNav.vue'
import { createNovel } from '@/utils/api'

const router = useRouter()

const title = ref('')
const description = ref('')
const novelType = ref('')
const extraTagsText = ref('')
const isSubmitting = ref(false)
const errorMessage = ref<string | null>(null)

const tagSuggestions = [
  '玄幻',
  '奇幻',
  '科幻',
  '悬疑',
  '推理',
  '都市',
  '言情',
  '历史',
  '武侠',
  '仙侠',
  '游戏',
  '轻小说',
]

const tags = computed(() => {
  const base = novelType.value.trim()
  const extras = extraTagsText.value
    .split(/[,，]/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t !== base)
  return base ? [base, ...extras] : extras
})

async function onSubmit() {
  if (isSubmitting.value) return
  errorMessage.value = null

  const t = title.value.trim()
  if (!t) {
    errorMessage.value = '请填写书名'
    return
  }

  isSubmitting.value = true
  try {
    const res = await createNovel({
      title: t,
      description: description.value.trim() || undefined,
      type: novelType.value.trim() || undefined,
      tags: tags.value.length ? tags.value : undefined,
    })
    await router.push({ name: 'workbench', params: { novelId: res.item.id } })
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '创建失败'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0B1220]">
    <TopNav title="AI Novel Studio" />

    <div class="mx-auto max-w-6xl px-4 py-6">
      <div class="mb-4">
        <div class="text-base font-semibold text-zinc-100">
          新建小说
        </div>
        <div class="mt-1 text-xs text-zinc-400">
          创建后会跳转到创作工作台
        </div>
      </div>

      <div
        v-if="errorMessage"
        class="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4"
      >
        <div class="text-sm font-semibold text-red-200">
          创建失败
        </div>
        <div class="mt-1 break-words text-xs text-red-200/80">
          {{ errorMessage }}
        </div>
      </div>

      <div class="rounded-lg border border-zinc-800/60 bg-[#111A2E] p-6">
        <form
          class="space-y-4"
          @submit.prevent="onSubmit"
        >
          <div>
            <div class="text-xs font-semibold text-zinc-200">
              书名
            </div>
            <input
              v-model="title"
              class="mt-2 w-full rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
              placeholder="例如：戒指里的修仙录"
              autocomplete="off"
            >
          </div>

          <div>
            <div class="text-xs font-semibold text-zinc-200">
              简介
            </div>
            <textarea
              v-model="description"
              class="mt-2 min-h-24 w-full resize-y rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
              placeholder="一句话概括故事核心冲突"
            />
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <div class="text-xs font-semibold text-zinc-200">
                小说类型
              </div>
              <input
                v-model="novelType"
                list="novel-types"
                class="mt-2 w-full rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
                placeholder="选择或输入，例如：玄幻"
                autocomplete="off"
              >
              <datalist id="novel-types">
                <option
                  v-for="t in tagSuggestions"
                  :key="t"
                  :value="t"
                />
              </datalist>
            </div>

            <div>
              <div class="text-xs font-semibold text-zinc-200">
                额外标签（可选）
              </div>
              <input
                v-model="extraTagsText"
                class="mt-2 w-full rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-400/70"
                placeholder="用逗号分隔，例如：升级流, 热血"
                autocomplete="off"
              >
              <div
                v-if="tags.length"
                class="mt-2 flex flex-wrap gap-2"
              >
                <span
                  v-for="t in tags"
                  :key="t"
                  class="rounded-md border border-zinc-700/60 bg-zinc-900/30 px-2 py-0.5 text-[11px] text-zinc-200"
                >
                  {{ t }}
                </span>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3 pt-2">
            <button
              class="inline-flex items-center justify-center rounded-md bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="isSubmitting"
              type="submit"
            >
              {{ isSubmitting ? '创建中...' : '创建小说' }}
            </button>

            <router-link
              class="inline-flex items-center justify-center rounded-md border border-zinc-700/60 bg-zinc-900/30 px-4 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60"
              :to="{ name: 'home' }"
            >
              返回列表
            </router-link>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
