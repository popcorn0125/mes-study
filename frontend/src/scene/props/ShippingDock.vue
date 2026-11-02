<script setup lang="ts">
import { computed } from 'vue'
import type { Vec3 } from '../layout'
import BoxInstances from './BoxInstances.vue'

/**
 * 출하장 팔레트. 양품이 완료될 때마다 상자가 하나씩 쌓이고(3×3×3), 한 팔레트가 차면 새 팔레트로 넘어간다.
 */
const props = defineProps<{ position: Vec3; completed: number }>()

const PER_LAYER = 9
const PER_PALLET = PER_LAYER * 3
const CARTON = 0.42

const cartons = computed(() => {
  const count = props.completed === 0 ? 0 : ((props.completed - 1) % PER_PALLET) + 1
  return Array.from({ length: count }, (_, i): Vec3 => {
    const layer = Math.floor(i / PER_LAYER)
    const slot = i % PER_LAYER
    return [((slot % 3) - 1) * (CARTON + 0.03), 0.16 + CARTON / 2 + layer * (CARTON + 0.01), (Math.floor(slot / 3) - 1) * (CARTON + 0.03)]
  })
})
</script>

<template>
  <TresGroup :position="[position[0], 0, position[2]]">
    <!-- 나무 팔레트 -->
    <TresMesh :position="[0, 0.13, 0]">
      <TresBoxGeometry :args="[1.45, 0.04, 1.45]" />
      <TresMeshStandardMaterial
        color="#8a6a42"
        :roughness="0.9"
      />
    </TresMesh>
    <TresMesh
      v-for="z in [-0.6, 0, 0.6]"
      :key="z"
      :position="[0, 0.055, z]"
    >
      <TresBoxGeometry :args="[1.45, 0.11, 0.14]" />
      <TresMeshStandardMaterial
        color="#6e5434"
        :roughness="0.9"
      />
    </TresMesh>
    <!-- 상자는 1개씩 늘었다 줄었다 하므로, 메시를 만들고 지우지 않고 한 팔레트분 칸에서 그릴 개수만 바꾼다 -->
    <BoxInstances
      :size="[CARTON, CARTON, CARTON]"
      :positions="cartons"
      :capacity="PER_PALLET"
      color="#b08850"
      :roughness="0.9"
    />
  </TresGroup>
</template>
