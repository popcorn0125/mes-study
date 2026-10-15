<script setup lang="ts">
import type { Vec3 } from '../layout'

/** 불량품 폐기함: 윗면이 열린 빨간 통 */
defineProps<{ position: Vec3 }>()

const WALLS: { position: Vec3; size: Vec3 }[] = [
  { position: [0, 0.3, 0.5], size: [1.2, 0.6, 0.04] },
  { position: [0, 0.3, -0.5], size: [1.2, 0.6, 0.04] },
  { position: [0.6, 0.3, 0], size: [0.04, 0.6, 1.04] },
  { position: [-0.6, 0.3, 0], size: [0.04, 0.6, 1.04] },
  { position: [0, 0.02, 0], size: [1.2, 0.04, 1.0] },
]
</script>

<template>
  <TresGroup :position="[position[0], 0, position[2]]">
    <TresMesh
      v-for="(wall, i) in WALLS"
      :key="i"
      :position="wall.position"
    >
      <TresBoxGeometry :args="wall.size" />
      <TresMeshStandardMaterial
        color="#8e1f1f"
        :roughness="0.7"
      />
    </TresMesh>
    <!-- 앞면 경고 띠 -->
    <TresMesh :position="[0, 0.48, 0.525]">
      <TresBoxGeometry :args="[1.2, 0.1, 0.01]" />
      <TresMeshStandardMaterial color="#d4a72c" />
    </TresMesh>
  </TresGroup>
</template>
