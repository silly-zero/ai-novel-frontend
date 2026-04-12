<script setup lang="ts">
import { computed } from 'vue'
import { RefreshCcw } from 'lucide-vue-next'

type Props = {
  title: string
  rightLabel?: string
  rightDisabled?: boolean
  rightLoading?: boolean
}

const props = defineProps<Props>()

const rightText = computed(() => {
  if (!props.rightLabel) return ''
  if (!props.rightLoading) return props.rightLabel
  return '刷新中...'
})

const emit = defineEmits<{ (e: 'right-click'): void }>()

function onClick() {
  if (props.rightDisabled) return
  emit('right-click')
}
</script>

<template>
  <div class="sticky top-0 z-10 border-b border-zinc-800/60 bg-[#0B1220]/80 backdrop-blur">
    <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
      <div class="flex items-center gap-2">
        <div class="h-2 w-2 rounded-full bg-blue-400" />
        <div class="text-sm font-semibold text-zinc-100">{{ title }}</div>
      </div>

      <button
        v-if="rightLabel"
        class="inline-flex items-center gap-2 rounded-md border border-zinc-700/60 bg-zinc-900/40 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-zinc-900/70 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="rightDisabled"
        type="button"
        @click="onClick"
      >
        <RefreshCcw class="h-4 w-4" :class="rightLoading ? 'animate-spin' : ''" />
        <span>{{ rightText }}</span>
      </button>
    </div>
  </div>
</template>
