import { onMounted, onUnmounted, ref } from 'vue'
import { deleteNovel, listNovels, type NovelSummary } from '@/utils/api'

export function useNovels() {
  const items = ref<NovelSummary[]>([])
  const isLoading = ref(false)
  const errorMessage = ref<string | null>(null)
  const deletingId = ref<string | null>(null)

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

  async function remove(id: string) {
    if (deletingId.value) return
    deletingId.value = id
    errorMessage.value = null
    try {
      await deleteNovel(id, abort.signal)
      items.value = items.value.filter((item) => item.id !== id)
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : '删除失败'
    } finally {
      deletingId.value = null
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
    deletingId,
    refresh,
    remove,
  }
}

