<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import TopNav from '@/components/TopNav.vue'

const route = useRoute()
const novelId = computed(() => String(route.params.novelId ?? ''))
</script>

<template>
  <div class="min-h-screen bg-[#0B1220]">
    <TopNav title="AI Novel Studio" />

    <div class="mx-auto max-w-6xl px-4 py-6">
      <div class="rounded-lg border border-zinc-800/60 bg-[#111A2E] p-6">
        <div class="text-base font-semibold text-zinc-100">创作工作台</div>
        <div class="mt-1 text-xs text-zinc-400">novel_id: {{ novelId }}</div>

        <div class="mt-4 text-xs text-zinc-300">
          你可以在这里接入 SSE 章节生成与上下文预览。
        </div>

        <router-link
          class="mt-5 inline-flex items-center justify-center rounded-md border border-zinc-700/60 bg-zinc-900/30 px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-900/60"
          :to="{ name: 'home' }"
        >
          返回小说列表
        </router-link>
      </div>
    </div>
  </div>
</template>

