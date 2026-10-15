<script setup lang="ts">
import { computed } from 'vue'
import type { TresPointerEvent } from '@tresjs/core'
import { useSelectionStore } from '@/stores/selection'
import { useSimStore } from '@/stores/sim'
import { bufferFillColor } from './colors'
import { shelfHeight, type Vec3 } from './layout'
import { hoverCursor } from './pointer'
import SelectionRing from './SelectionRing.vue'
import SceneLabel from './SceneLabel.vue'

const props = defineProps<{
  workCenterId: string
  capacity: number
  position: Vec3
}>()

const sim = useSimStore()
const selection = useSelectionStore()
const selected = computed(() => selection.isSelected('workCenter', props.workCenterId))

function onClick(event: TresPointerEvent) {
  event.stopPropagation()
  selection.select({ kind: 'workCenter', id: props.workCenterId })
}

const count = computed(() => sim.state.buffers[props.workCenterId]?.length ?? 0)
const fillColor = computed(() => bufferFillColor(count.value / props.capacity))
const postHeight = shelfHeight(props.capacity) + 0.35
</script>

<template>
  <TresGroup :position="position">
    <!-- 점유율에 따라 색이 바뀌는 받침판 -->
    <TresMesh
      :position="[0, 0.15, 0]"
      @click="onClick"
      @pointerenter="hoverCursor.enter"
      @pointerleave="hoverCursor.leave"
    >
      <TresBoxGeometry :args="[1.05, 0.3, 0.7]" />
      <TresMeshStandardMaterial :color="fillColor" />
    </TresMesh>
    <!-- 선반 기둥: 버퍼 용량(최대 적재 높이)을 보여준다 -->
    <TresMesh :position="[-0.5, postHeight / 2, -0.32]">
      <TresBoxGeometry :args="[0.05, postHeight, 0.05]" />
      <TresMeshStandardMaterial color="#484f58" />
    </TresMesh>
    <TresMesh :position="[0.5, postHeight / 2, -0.32]">
      <TresBoxGeometry :args="[0.05, postHeight, 0.05]" />
      <TresMeshStandardMaterial color="#484f58" />
    </TresMesh>
    <SelectionRing
      v-if="selected"
      :radius="0.8"
    />
    <SceneLabel :position="[0, -0.05, 0.75]">
      <div class="scene-label scene-label--small">
        대기 {{ count }}/{{ capacity }}
      </div>
    </SceneLabel>
  </TresGroup>
</template>
