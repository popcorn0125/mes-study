<script setup lang="ts">
import { computed } from 'vue'
import { AISLE_Z } from '../layout'

/** 공장 바닥: 바닥판, 격자, 안전 통로 노란 선. */
const props = defineProps<{ lineStart: number; lineEnd: number }>()

const FLOOR_SIZE: [number, number] = [70, 36]
/** 통로 양쪽 노란 선의 z */
const AISLE_LINES = [AISLE_Z - 0.55, AISLE_Z + 0.55]
/** 라인 뒤쪽 경계선 */
const BACK_LINE_Z = -3.3

const lineLength = computed(() => props.lineEnd - props.lineStart)
const lineCenter = computed(() => (props.lineStart + props.lineEnd) / 2)
</script>

<template>
  <TresMesh
    :rotation="[-Math.PI / 2, 0, 0]"
    :position="[0, -0.01, 0]"
  >
    <TresPlaneGeometry :args="FLOOR_SIZE" />
    <TresMeshStandardMaterial
      color="#151c25"
      :roughness="0.85"
    />
  </TresMesh>
  <TresGridHelper
    :args="[70, 70, '#1b2530', '#18202a']"
    :position="[0, 0.001, 0]"
  />

  <!-- 안전 통로(노란 선) -->
  <TresMesh
    v-for="z in [...AISLE_LINES, BACK_LINE_Z]"
    :key="z"
    :rotation="[-Math.PI / 2, 0, 0]"
    :position="[lineCenter, 0.006, z]"
  >
    <TresPlaneGeometry :args="[lineLength, 0.1]" />
    <TresMeshBasicMaterial color="#d4a72c" />
  </TresMesh>
  <!-- 통로 바닥(약간 밝게) -->
  <TresMesh
    :rotation="[-Math.PI / 2, 0, 0]"
    :position="[lineCenter, 0.004, AISLE_Z]"
  >
    <TresPlaneGeometry :args="[lineLength, 1.0]" />
    <TresMeshStandardMaterial color="#1c2733" />
  </TresMesh>
</template>
