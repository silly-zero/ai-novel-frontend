<script setup lang="ts">
import { BookOpen, ChevronRight } from 'lucide-vue-next'
import type { NovelSummary } from '@/utils/api'

defineProps<{ item: NovelSummary }>()
</script>

<template>
  <div
    class="flex items-start justify-between gap-4 rounded-lg border border-zinc-800/60 bg-[#111A2E] p-4 transition hover:border-zinc-700/80 hover:bg-[#121C33]"
  >
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <BookOpen class="h-4 w-4 text-blue-300" />
        <div class="truncate text-sm font-semibold text-zinc-100">{{ item.title }}</div>
      </div>
      <div v-if="item.description" class="mt-1 line-clamp-2 text-xs text-zinc-300/90">
        {{ item.description }}
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
        <span class="rounded bg-zinc-900/50 px-2 py-0.5">ID: {{ item.id }}</span>
        <span class="rounded bg-zinc-900/50 px-2 py-0.5">{{ item.status }}</span>
        <span class="rounded bg-zinc-900/50 px-2 py-0.5">更新: {{ new Date(item.updated_at).toLocaleString() }}</span>
      </div>
      <div v-if="item.tags?.length" class="mt-2 flex flex-wrap gap-2">
        <span
          v-for="t in item.tags"
          :key="t"
          class="rounded-md border border-zinc-700/60 bg-zinc-900/30 px-2 py-0.5 text-[11px] text-zinc-200"
        >
          {{ t }}
        </span>
      </div>
    </div>

    <router-link
      class="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-400"
      :to="{ name: 'workbench', params: { novelId: item.id } }"
    >
      进入创作
      <ChevronRight class="h-4 w-4" />
    </router-link>
  </div>
</template>

