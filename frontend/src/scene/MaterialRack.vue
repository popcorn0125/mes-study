<script setup lang="ts">
import { computed } from 'vue'
import { maxQtyPer } from '@/domain/kpi'
import { useSimStore } from '@/stores/sim'
import { stockColor } from './colors'
import type { Vec3 } from './layout'
import SceneLabel from './SceneLabel.vue'

/** 자재 창고의 자재별 재고 막대. 높이 = 재고량, 색 = 결품/발주점 이하/정상 */
const props = defineProps<{ position: Vec3 }>()

const BAR_SPACING = 1.2
const MAX_BAR_HEIGHT = 2.2
/** 재고 막대를 올려 둔 팔레트 높이 */
const PALLET_HEIGHT = 0.12
const RACK_HEIGHT = 2.7

const sim = useSimStore()

const bars = computed(() => {
  const materials = sim.master.materials
  return materials.map((m, i) => {
    const stock = sim.state.materials[m.id]
    const scale = Math.max(m.initialStock, m.reorderPoint + m.reorderQty)
    const height = 0.05 + MAX_BAR_HEIGHT * Math.min(1, stock.onHand / scale)
    const incoming = stock.orders.reduce((sum, po) => sum + po.qty, 0)
    return {
      id: m.id,
      name: m.name,
      onHand: stock.onHand,
      incoming,
      height,
      color: stockColor(stock.onHand, m.reorderPoint, maxQtyPer(sim.master, m.id)),
      z: (i - (materials.length - 1) / 2) * BAR_SPACING,
    }
  })
})

/** 팔레트 랙 기둥: 자재 칸 사이사이와 양 끝 */
const uprightZs = computed(() => {
  const n = sim.master.materials.length
  return Array.from({ length: n + 1 }, (_, i) => (i - n / 2) * BAR_SPACING)
})
const rackDepth = computed(() => sim.master.materials.length * BAR_SPACING)
</script>

<template>
  <TresGroup :position="props.position">
    <!-- 팔레트 랙 프레임 -->
    <TresGroup
      v-for="z in uprightZs"
      :key="z"
      :position="[0, 0, z]"
    >
      <TresMesh
        v-for="x in [-0.42, 0.42]"
        :key="x"
        :position="[x, RACK_HEIGHT / 2, 0]"
      >
        <TresBoxGeometry :args="[0.06, RACK_HEIGHT, 0.06]" />
        <TresMeshStandardMaterial color="#2f6db5" />
      </TresMesh>
    </TresGroup>
    <TresMesh
      v-for="x in [-0.42, 0.42]"
      :key="x"
      :position="[x, RACK_HEIGHT - 0.05, 0]"
    >
      <TresBoxGeometry :args="[0.07, 0.1, rackDepth]" />
      <TresMeshStandardMaterial color="#e3812b" />
    </TresMesh>
    <TresGroup
      v-for="bar in bars"
      :key="bar.id"
      :position="[0, 0, bar.z]"
    >
      <TresMesh :position="[0, PALLET_HEIGHT / 2, 0]">
        <TresBoxGeometry :args="[0.7, PALLET_HEIGHT, 0.7]" />
        <TresMeshStandardMaterial
          color="#8a6a42"
          :roughness="0.9"
        />
      </TresMesh>
      <TresMesh
        :position="[0, PALLET_HEIGHT + bar.height / 2, 0]"
        :scale="[1, bar.height, 1]"
      >
        <TresBoxGeometry :args="[0.5, 1, 0.5]" />
        <TresMeshStandardMaterial :color="bar.color" />
      </TresMesh>
      <SceneLabel :position="[0, PALLET_HEIGHT + bar.height + 0.35, 0]">
        <div class="scene-label scene-label--small scene-label--stock">
          {{ bar.name }}
          <strong :style="{ color: bar.color }">{{ bar.onHand }}</strong>
          <span v-if="bar.incoming">+{{ bar.incoming }}</span>
        </div>
      </SceneLabel>
    </TresGroup>
  </TresGroup>
</template>
