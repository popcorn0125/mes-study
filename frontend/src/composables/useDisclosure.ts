import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * 버튼으로 여닫는 드롭다운 메뉴의 열림 상태.
 * - 메뉴 바깥을 누르거나 Esc를 누르면 닫는다. Esc로 닫으면 포커스를 여는 버튼으로 돌려준다.
 * - root: 버튼과 메뉴를 감싼 요소(바깥 클릭 판정), trigger: 여는 버튼
 */
export function useDisclosure(root: Ref<HTMLElement | null>, trigger: Ref<HTMLElement | null>) {
  const open = ref(false)

  function toggle() {
    open.value = !open.value
  }

  function close({ restoreFocus = false } = {}) {
    if (!open.value) return
    open.value = false
    if (restoreFocus) void nextTick(() => trigger.value?.focus())
  }

  function onPointerDown(event: PointerEvent) {
    if (open.value && root.value && !root.value.contains(event.target as Node)) close()
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') close({ restoreFocus: true })
  }

  onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeydown)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('keydown', onKeydown)
  })

  return { open, toggle, close }
}
