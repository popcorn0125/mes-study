<script setup lang="ts">
import { bufferFillColor } from './colors'
import { shelfHeight, type Vec3 } from './layout'

/** 작업장 입력 버퍼 선반(정적 표시: 빈 선반) */
const props = defineProps<{
  capacity: number
  position: Vec3
}>()

const fillColor = bufferFillColor(0)
const postHeight = shelfHeight(props.capacity) + 0.35
</script>

<template>
  <TresGroup :position="position">
    <!-- 받침판 -->
    <TresMesh :position="[0, 0.15, 0]">
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
  </TresGroup>
</template>
