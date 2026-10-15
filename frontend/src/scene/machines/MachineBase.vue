<script setup lang="ts">
import { MACHINE_COLOR } from './kinds'

/** 설비 하부 캐비닛과 작업대(윗면 높이 1.0). 바닥 띠(상태색)는 EquipmentMesh가 그린다. */
</script>

<template>
  <TresMesh :position="[0, 0.525, 0]">
    <TresBoxGeometry :args="[1.4, 0.85, 1.2]" />
    <TresMeshStandardMaterial
      :color="MACHINE_COLOR.body"
      :roughness="0.55"
      :metalness="0.2"
    />
  </TresMesh>
  <!-- 앞면 점검 도어 홈 -->
  <TresMesh :position="[0, 0.55, 0.601]">
    <TresBoxGeometry :args="[1.1, 0.6, 0.01]" />
    <TresMeshStandardMaterial
      color="#aab1ba"
      :roughness="0.6"
    />
  </TresMesh>
  <TresMesh :position="[0, 0.975, 0]">
    <TresBoxGeometry :args="[1.36, 0.05, 1.16]" />
    <TresMeshStandardMaterial
      color="#6b7480"
      :roughness="0.4"
      :metalness="0.6"
    />
  </TresMesh>
</template>
