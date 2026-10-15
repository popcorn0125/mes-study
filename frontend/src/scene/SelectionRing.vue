<script setup lang="ts">
/** 선택된 객체 바닥에 깔리는 강조 링 */
defineProps<{ radius: number }>()
</script>

<template>
  <TresMesh
    :rotation="[-Math.PI / 2, 0, 0]"
    :position="[0, 0.03, 0]"
  >
    <TresRingGeometry :args="[radius, radius + 0.12, 48]" />
    <TresMeshBasicMaterial color="#2f81f7" />
  </TresMesh>
</template>
