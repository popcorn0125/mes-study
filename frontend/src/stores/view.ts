import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 화면 표시 옵션(시뮬레이션 결과에는 영향 없음) */
export const useViewStore = defineStore('view', () => {
  /** 작업장 바닥을 가동률 히트맵으로 칠한다 */
  const heatmap = ref(false)
  /** 시점 초기화 요청 번호. 값이 바뀌면 3D 장면이 카메라를 처음 시점으로 되돌린다. */
  const cameraResetRequest = ref(0)

  function toggleHeatmap() {
    heatmap.value = !heatmap.value
  }

  function resetCamera() {
    cameraResetRequest.value++
  }

  return { heatmap, cameraResetRequest, toggleHeatmap, resetCamera }
})
