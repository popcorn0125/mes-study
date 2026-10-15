import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 상세 패널에 띄울 대상. 작업장을 고르면 입력 버퍼와 소속 설비를 함께 보여준다. */
export type Selection =
  | { kind: 'equipment'; id: string }
  | { kind: 'workCenter'; id: string }
  | { kind: 'unit'; id: string }
  | { kind: 'workOrder'; id: string }
  | { kind: 'material'; id: string }

export const useSelectionStore = defineStore('selection', () => {
  const selected = ref<Selection | null>(null)

  function select(next: Selection) {
    selected.value = next
  }

  function clear() {
    selected.value = null
  }

  function isSelected(kind: Selection['kind'], id: string): boolean {
    return selected.value?.kind === kind && selected.value.id === id
  }

  return { selected, select, clear, isSelected }
})
