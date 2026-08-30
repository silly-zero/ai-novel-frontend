import type { DerivedStatus, DerivedTaskStatus } from './api'

export function derivedStatusLabel(status: DerivedStatus): string {
  switch (status) {
    case 'Ready':
      return '派生已就绪'
    case 'Pending':
      return '派生处理中'
    case 'Failed':
      return '辅助数据未完成'
  }
}

export function derivedStatusClass(status: DerivedStatus): string {
  switch (status) {
    case 'Ready':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
    case 'Pending':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-200'
    case 'Failed':
      return 'border-red-500/40 bg-red-500/10 text-red-200'
  }
}

export function derivedTaskLabel(handlerKey: string): string {
  switch (handlerKey) {
    case 'memory':
      return '记忆索引'
    case 'character':
      return '角色状态'
    case 'world':
      return '世界设定'
    default:
      return '未知派生任务'
  }
}

export function derivedTaskStatusLabel(status: DerivedTaskStatus): string {
  switch (status) {
    case 'Ready':
      return '已就绪'
    case 'Pending':
      return '等待处理'
    case 'Running':
      return '处理中'
    case 'Failed':
      return '失败'
  }
}
