import { onMounted, onUnmounted, ref } from 'vue'
import { listNovels, type NovelSummary } from '@/utils/api'

export function useNovels() {
  const items = ref<NovelSummary[]>([])
  const isLoading = ref(false)
  const errorMessage = ref<string | null>(null)

  const abort = new AbortController()

  async function refresh() {
    isLoading.value = true
    errorMessage.value = null
    try {
      const res = await listNovels(abort.signal)
      items.value = res.items
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : '请求失败'
    } finally {
      isLoading.value = false
    }
  }

  onMounted(() => {
    void refresh()
  })

  onUnmounted(() => {
    abort.abort()
  })

  return {
    items,
    isLoading,
    errorMessage,
    refresh,
  }
}

