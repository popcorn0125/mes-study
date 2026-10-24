<script setup lang="ts">
import { shallowRef } from 'vue'
import type { Mesh, MeshStandardMaterial } from 'three'
import { MACHINE_COLOR } from './kinds'
import MachineBase from './MachineBase.vue'
import { useEquipmentFrame } from './useEquipmentFrame'

/**
 * 검사 스테이션: 비전 카메라 아래로 스캔 빔이 지나가며 작업물을 검사한다.
 * 생산 수량이 늘면 그 판정 결과(양품/불량)에 따라 OK(초록)·NG(빨강) 램프가 켜진다.
 */
const props = defineProps<{ equipmentId: string }>()

const beam = shallowRef<Mesh>()
const okLamp = shallowRef<MeshStandardMaterial>()
const ngLamp = shallowRef<MeshStandardMaterial>()

const RESULT_LAMP_SECONDS = 1.2
let phase = 0
let lastTotal: number | null = null
let lamp: { result: 'GOOD' | 'DEFECT'; until: number } | null = null

let lastBad = 0

useEquipmentFrame(props.equipmentId, (eq, { dt, elapsed }) => {
  // 검사 수량이 늘면, 불량 수량이 함께 늘었는지로 방금 나간 작업물의 판정 결과를 램프로 보여 준다
  const { totalCount, badCount } = eq.production
  if (lastTotal !== null && totalCount > lastTotal) {
    lamp = { result: badCount > lastBad ? 'DEFECT' : 'GOOD', until: elapsed + RESULT_LAMP_SECONDS }
  }
  lastTotal = totalCount
  lastBad = badCount
  const showing = lamp && elapsed < lamp.until ? lamp.result : null
  if (okLamp.value) okLamp.value.emissiveIntensity = showing === 'GOOD' ? 2.5 : 0.05
  if (ngLamp.value) ngLamp.value.emissiveIntensity = showing === 'DEFECT' ? 2.5 : 0.05

  if (!beam.value) return
  beam.value.visible = eq.status === 'RUN'
  if (eq.status === 'RUN') {
    phase += dt * 2.5
    beam.value.position.x = Math.sin(phase) * 0.35
  }
})
</script>

<template>
  <MachineBase />
  <!-- 문형 프레임 -->
  <TresMesh
    v-for="z in [-0.55, 0.55]"
    :key="z"
    :position="[0, 1.45, z]"
  >
    <TresBoxGeometry :args="[0.1, 0.9, 0.08]" />
    <TresMeshStandardMaterial :color="MACHINE_COLOR.body" />
  </TresMesh>
  <TresMesh :position="[0, 1.92, 0]">
    <TresBoxGeometry :args="[0.16, 0.1, 1.2]" />
    <TresMeshStandardMaterial :color="MACHINE_COLOR.body" />
  </TresMesh>
  <!-- 비전 카메라와 링 조명 -->
  <TresMesh :position="[0, 1.78, 0]">
    <TresBoxGeometry :args="[0.2, 0.18, 0.2]" />
    <TresMeshStandardMaterial :color="MACHINE_COLOR.dark" />
  </TresMesh>
  <TresMesh :position="[0, 1.66, 0]">
    <TresCylinderGeometry :args="[0.06, 0.06, 0.08, 16]" />
    <TresMeshStandardMaterial
      color="#111"
      :metalness="0.9"
      :roughness="0.1"
    />
  </TresMesh>
  <TresMesh
    :position="[0, 1.6, 0]"
    :rotation="[Math.PI / 2, 0, 0]"
  >
    <TresTorusGeometry :args="[0.13, 0.02, 8, 24]" />
    <TresMeshStandardMaterial
      color="#ffffff"
      emissive="#e6f2ff"
      :emissive-intensity="1.2"
    />
  </TresMesh>
  <!-- 스캔 빔 -->
  <TresMesh
    ref="beam"
    :position="[0, 1.3, 0]"
    :visible="false"
  >
    <TresBoxGeometry :args="[0.015, 0.6, 1.0]" />
    <TresMeshBasicMaterial
      color="#39d353"
      transparent
      :opacity="0.45"
      :depth-write="false"
    />
  </TresMesh>
  <!-- 판정 램프 OK / NG -->
  <TresGroup :position="[0.12, 1.92, 0.62]">
    <TresMesh :position="[-0.1, 0, 0]">
      <TresBoxGeometry :args="[0.16, 0.1, 0.04]" />
      <TresMeshStandardMaterial
        ref="okLamp"
        color="#1a3d1f"
        emissive="#3fb950"
        :emissive-intensity="0.05"
      />
    </TresMesh>
    <TresMesh :position="[0.1, 0, 0]">
      <TresBoxGeometry :args="[0.16, 0.1, 0.04]" />
      <TresMeshStandardMaterial
        ref="ngLamp"
        color="#3d1a1a"
        emissive="#f85149"
        :emissive-intensity="0.05"
      />
    </TresMesh>
  </TresGroup>
</template>
