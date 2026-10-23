<script setup lang="ts">
import { Html } from '@tresjs/cientos'
import type { Vec3 } from './layout'

/**
 * 3D 위치에 붙는 HTML 라벨.
 * Html의 기본 z-index 범위(최대 16777271)는 화면 패널보다 위에 그려지므로, 패널(z-index 20) 아래로 낮춘다.
 */
defineProps<{ position: Vec3 }>()

const LABEL_Z_INDEX_RANGE = [10, 0]
const LABEL_DISTANCE_FACTOR = 22
</script>

<template>
  <Html
    center
    :position="position"
    :distance-factor="LABEL_DISTANCE_FACTOR"
    :z-index-range="LABEL_Z_INDEX_RANGE"
  >
    <slot />
  </Html>
</template>
