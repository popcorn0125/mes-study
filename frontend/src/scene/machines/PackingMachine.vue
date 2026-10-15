<script setup lang="ts">
import { shallowRef } from 'vue'
import type { Group } from 'three'
import { MACHINE_COLOR } from './kinds'
import MachineBase from './MachineBase.vue'
import { useEquipmentFrame } from './useEquipmentFrame'

/** 포장기: 작업물이 상자에 담기면 위에서 누름판이 내려와 덮개를 접는다. 옆에는 접힌 빈 상자가 쌓여 있다. */
const props = defineProps<{ equipmentId: string }>()

const press = shallowRef<Group>()
const PRESS_TOP = 1.78
let phase = 0

useEquipmentFrame(props.equipmentId, (eq, { dt }) => {
  if (!press.value) return
  if (eq.status === 'RUN') {
    phase += dt * 3
    press.value.position.y = PRESS_TOP - 0.22 * Math.max(0, Math.sin(phase))
  } else {
    press.value.position.y = PRESS_TOP
  }
})

const CARTON_WALLS: { position: [number, number, number]; size: [number, number, number] }[] = [
  { position: [0, 1.15, 0.24], size: [0.5, 0.3, 0.02] },
  { position: [0, 1.15, -0.24], size: [0.5, 0.3, 0.02] },
  { position: [0.24, 1.15, 0], size: [0.02, 0.3, 0.46] },
  { position: [-0.24, 1.15, 0], size: [0.02, 0.3, 0.46] },
]
</script>

<template>
  <MachineBase />
  <!-- 작업물을 담는 상자(윗면이 열린) -->
  <TresMesh
    v-for="(wall, i) in CARTON_WALLS"
    :key="i"
    :position="wall.position"
  >
    <TresBoxGeometry :args="wall.size" />
    <TresMeshStandardMaterial
      :color="MACHINE_COLOR.carton"
      :roughness="0.9"
    />
  </TresMesh>
  <!-- 뒤 기둥과 누름판 -->
  <TresMesh :position="[0, 1.5, -0.5]">
    <TresBoxGeometry :args="[0.9, 1.0, 0.1]" />
    <TresMeshStandardMaterial :color="MACHINE_COLOR.body" />
  </TresMesh>
  <TresGroup
    ref="press"
    :position="[0, PRESS_TOP, 0]"
  >
    <TresMesh :position="[0, 0.2, -0.25]">
      <TresBoxGeometry :args="[0.12, 0.1, 0.5]" />
      <TresMeshStandardMaterial :color="MACHINE_COLOR.dark" />
    </TresMesh>
    <TresMesh :position="[0, 0.08, 0]">
      <TresBoxGeometry :args="[0.06, 0.2, 0.06]" />
      <TresMeshStandardMaterial
        :color="MACHINE_COLOR.steel"
        :metalness="0.8"
      />
    </TresMesh>
    <TresMesh>
      <TresBoxGeometry :args="[0.46, 0.04, 0.42]" />
      <TresMeshStandardMaterial
        :color="MACHINE_COLOR.steel"
        :metalness="0.6"
      />
    </TresMesh>
  </TresGroup>
  <!-- 접힌 빈 상자 더미 -->
  <TresMesh
    v-for="i in 5"
    :key="i"
    :position="[0.5, 0.98 + i * 0.035, 0.38]"
    :rotation="[0, (i % 2) * 0.08, 0]"
  >
    <TresBoxGeometry :args="[0.34, 0.03, 0.3]" />
    <TresMeshStandardMaterial
      :color="MACHINE_COLOR.carton"
      :roughness="0.9"
    />
  </TresMesh>
</template>
