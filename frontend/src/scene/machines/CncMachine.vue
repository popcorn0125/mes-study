<script setup lang="ts">
import { shallowRef } from 'vue'
import type { Group, Mesh } from 'three'
import { MACHINE_COLOR } from './kinds'
import MachineBase from './MachineBase.vue'
import { useEquipmentFrame } from './useEquipmentFrame'

/** CNC 가공기: 유리창 너머로 스핀들이 회전하며 좌우로 이송한다. */
const props = defineProps<{ equipmentId: string }>()

const head = shallowRef<Group>()
const spindle = shallowRef<Mesh>()
let phase = 0

useEquipmentFrame(props.equipmentId, (eq, { dt }) => {
  if (eq.status !== 'RUN') return
  phase += dt
  if (spindle.value) spindle.value.rotation.y += dt * 25
  if (head.value) head.value.position.x = Math.sin(phase * 1.5) * 0.3
})

const POSTS: [number, number][] = [
  [-0.68, -0.58],
  [0.68, -0.58],
  [-0.68, 0.58],
  [0.68, 0.58],
]
</script>

<template>
  <MachineBase />
  <!-- 가공실: 기둥 4개 + 지붕 + 유리창 -->
  <TresMesh
    v-for="([x, z], i) in POSTS"
    :key="i"
    :position="[x, 1.45, z]"
  >
    <TresBoxGeometry :args="[0.05, 0.9, 0.05]" />
    <TresMeshStandardMaterial :color="MACHINE_COLOR.dark" />
  </TresMesh>
  <TresMesh :position="[0, 1.94, 0]">
    <TresBoxGeometry :args="[1.42, 0.08, 1.22]" />
    <TresMeshStandardMaterial
      :color="MACHINE_COLOR.body"
      :roughness="0.5"
    />
  </TresMesh>
  <TresMesh :position="[0, 1.45, -0.59]">
    <TresBoxGeometry :args="[1.36, 0.9, 0.02]" />
    <TresMeshStandardMaterial :color="MACHINE_COLOR.body" />
  </TresMesh>
  <TresMesh :position="[0, 1.45, 0.59]">
    <TresBoxGeometry :args="[1.32, 0.86, 0.01]" />
    <TresMeshStandardMaterial
      :color="MACHINE_COLOR.glass"
      transparent
      :opacity="0.18"
      :depth-write="false"
    />
  </TresMesh>
  <TresMesh
    v-for="side in [-1, 1]"
    :key="side"
    :position="[side * 0.69, 1.45, 0]"
  >
    <TresBoxGeometry :args="[0.01, 0.86, 1.12]" />
    <TresMeshStandardMaterial
      :color="MACHINE_COLOR.glass"
      transparent
      :opacity="0.18"
      :depth-write="false"
    />
  </TresMesh>
  <!-- 주축 헤드(가공 중 좌우 이송) -->
  <TresGroup ref="head">
    <TresMesh :position="[0, 1.75, 0]">
      <TresBoxGeometry :args="[0.3, 0.3, 0.34]" />
      <TresMeshStandardMaterial
        :color="MACHINE_COLOR.steel"
        :metalness="0.7"
        :roughness="0.35"
      />
    </TresMesh>
    <TresMesh
      ref="spindle"
      :position="[0, 1.52, 0]"
    >
      <TresCylinderGeometry :args="[0.05, 0.03, 0.18, 6]" />
      <TresMeshStandardMaterial
        color="#e6edf3"
        :metalness="0.9"
        :roughness="0.2"
      />
    </TresMesh>
  </TresGroup>
  <!-- 조작반 -->
  <TresGroup :position="[0.78, 1.3, 0.45]">
    <TresMesh>
      <TresBoxGeometry :args="[0.12, 0.5, 0.36]" />
      <TresMeshStandardMaterial :color="MACHINE_COLOR.dark" />
    </TresMesh>
    <TresMesh :position="[0.061, 0.08, 0]">
      <TresBoxGeometry :args="[0.005, 0.2, 0.28]" />
      <TresMeshStandardMaterial
        color="#0b3a5c"
        emissive="#1f6feb"
        :emissive-intensity="0.6"
      />
    </TresMesh>
  </TresGroup>
</template>
