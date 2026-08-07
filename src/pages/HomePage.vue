<script setup lang="ts">
import NovelListItem from '@/components/NovelListItem.vue'
import TopNav from '@/components/TopNav.vue'
import { useNovels } from '@/composables/useNovels'

const { items, isLoading, errorMessage, refresh } = useNovels()
</script>

<template>
  <div class="min-h-screen bg-[#0B1220]">
    <TopNav
      title="AI Novel Studio"
      right-label="刷新列表"
      :right-loading="isLoading"
      @right-click="refresh"
    />

    <div class="mx-auto max-w-6xl px-4 py-6">
      <div class="mb-4 flex items-end justify-between gap-4">
        <div>
          <div class="text-base font-semibold text-zinc-100">
            小说列表
          </div>
          <div class="mt-1 text-xs text-zinc-400">
            展示后端返回的全部小说
          </div>
        </div>
        <div class="flex items-center gap-3">
          <router-link
            class="inline-flex items-center justify-center rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-400"
            :to="{ name: 'novel-new' }"
          >
            新建小说
          </router-link>
          <div class="text-xs text-zinc-400">
            共 {{ items.length }} 本
          </div>
        </div>
      </div>

      <div
        v-if="errorMessage"
        class="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4"
      >
        <div class="text-sm font-semibold text-red-200">
          加载失败
        </div>
        <div class="mt-1 break-words text-xs text-red-200/80">
          {{ errorMessage }}
        </div>
        <button
          class="mt-3 rounded-md bg-red-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-400"
          type="button"
          @click="refresh"
        >
          重试
        </button>
      </div>

      <div
        v-if="isLoading"
        class="space-y-3"
      >
        <div
          v-for="i in 5"
          :key="i"
          class="animate-pulse rounded-lg border border-zinc-800/60 bg-[#111A2E] p-4"
        >
          <div class="h-4 w-56 rounded bg-zinc-800/60" />
          <div class="mt-3 h-3 w-80 rounded bg-zinc-800/60" />
          <div class="mt-2 h-3 w-64 rounded bg-zinc-800/60" />
        </div>
      </div>

      <div
        v-else-if="items.length === 0"
        class="rounded-lg border border-zinc-800/60 bg-[#111A2E] p-6"
      >
        <div class="text-sm font-semibold text-zinc-100">
          暂无小说
        </div>
        <div class="mt-1 text-xs text-zinc-400">
          当前数据库里还没有小说记录。
        </div>
      </div>

      <div
        v-else
        class="space-y-3"
      >
        <NovelListItem
          v-for="n in items"
          :key="n.id"
          :item="n"
        />
      </div>
    </div>
  </div>
</template>
