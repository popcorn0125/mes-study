<script setup lang="ts">
import { shallowRef } from 'vue'
import type { Group } from 'three'
import { MACHINE_COLOR } from './kinds'
import MachineBase from './MachineBase.vue'
import { useEquipmentFrame } from './useEquipmentFrame'

/** 권선기: 플라이어 암이 스테이터 둘레를 돌며 구리선을 감고, 뒤쪽 보빈이 풀린다. */
const props = defineProps<{ equipmentId: string }>()

const flyer = shallowRef<Group>()
const spools = shallowRef<Group>()

useEquipmentFrame(props.equipmentId, (eq, { dt }) => {
  if (eq.status !== 'RUN') return
  if (flyer.value) flyer.value.rotation.y += dt * 9
  if (spools.value) for (const spool of spools.value.children) spool.rotation.x += dt * 3
})
</script>

<template>
  <MachineBase />
  <!-- 뒤쪽 기둥과 위로 뻗은 암 -->
  <TresMesh :position="[0, 1.4, -0.5]">
    <TresBoxGeometry :args="[0.16, 0.8, 0.16]" />
    <TresMeshStandardMaterial :color="MACHINE_COLOR.body" />
  </TresMesh>
  <TresMesh :position="[0, 1.76, -0.22]">
    <TresBoxGeometry :args="[0.14, 0.12, 0.6]" />
    <TresMeshStandardMaterial :color="MACHINE_COLOR.body" />
  </TresMesh>
  <TresMesh :position="[0, 1.64, 0]">
    <TresCylinderGeometry :args="[0.05, 0.05, 0.14, 12]" />
    <TresMeshStandardMaterial
      :color="MACHINE_COLOR.steel"
      :metalness="0.7"
    />
  </TresMesh>
  <!-- 플라이어(회전) -->
  <TresGroup
    ref="flyer"
    :position="[0, 1.55, 0]"
  >
    <TresMesh>
      <TresBoxGeometry :args="[0.62, 0.04, 0.05]" />
      <TresMeshStandardMaterial
        :color="MACHINE_COLOR.steel"
        :metalness="0.7"
      />
    </TresMesh>
    <TresMesh
      v-for="side in [-1, 1]"
      :key="side"
      :position="[side * 0.3, -0.13, 0]"
    >
      <TresBoxGeometry :args="[0.03, 0.26, 0.03]" />
      <TresMeshStandardMaterial :color="MACHINE_COLOR.copper" />
    </TresMesh>
  </TresGroup>
  <!-- 구리선 보빈 -->
  <TresGroup ref="spools">
    <TresMesh
      v-for="x in [-0.42, 0.42]"
      :key="x"
      :position="[x, 1.15, -0.38]"
      :rotation="[0, 0, Math.PI / 2]"
    >
      <TresCylinderGeometry :args="[0.13, 0.13, 0.22, 16]" />
      <TresMeshStandardMaterial
        :color="MACHINE_COLOR.copper"
        :metalness="0.8"
        :roughness="0.3"
      />
    </TresMesh>
  </TresGroup>
</template>
