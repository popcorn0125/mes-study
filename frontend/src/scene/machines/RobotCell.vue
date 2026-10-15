<script setup lang="ts">
import { shallowRef } from 'vue'
import type { Group } from 'three'
import { MACHINE_COLOR } from './kinds'
import { useEquipmentFrame } from './useEquipmentFrame'

/**
 * 조립 셀: 작업대 뒤쪽 모서리의 6축 로봇 팔이 부품 트레이와 작업물(작업대 가운데) 사이를 오간다.
 * 관절은 회전(yaw) → 어깨 → 팔꿈치 순서로 이어진다. 팔은 관절의 +y 방향으로 뻗고, rotation.z가 양수면 -x 쪽으로 숙인다.
 */
const props = defineProps<{ equipmentId: string }>()

/** 로봇 받침 위치에서 작업대 가운데(작업물)를 향하는 회전각 */
const YAW_TO_WORK = 0.72
const REST = { yaw: YAW_TO_WORK, shoulder: 0.25, elbow: 0.9 }

const turret = shallowRef<Group>()
const shoulder = shallowRef<Group>()
const elbow = shallowRef<Group>()
let phase = 0

useEquipmentFrame(props.equipmentId, (eq, { dt }) => {
  if (!turret.value || !shoulder.value || !elbow.value) return
  if (eq.status === 'RUN') {
    phase += dt * 2.2
    // 부품 트레이(왼쪽 뒤)로 갔다가 작업물로 돌아와 눌러 끼운다
    turret.value.rotation.y = YAW_TO_WORK + 0.75 * Math.sin(phase)
    shoulder.value.rotation.z = 0.45 + 0.2 * Math.sin(phase * 2)
    elbow.value.rotation.z = 1.0 + 0.25 * Math.cos(phase * 2)
  } else {
    // 멈추면 대기 자세로 천천히 돌아간다
    const k = Math.min(1, dt * 3)
    turret.value.rotation.y += (REST.yaw - turret.value.rotation.y) * k
    shoulder.value.rotation.z += (REST.shoulder - shoulder.value.rotation.z) * k
    elbow.value.rotation.z += (REST.elbow - elbow.value.rotation.z) * k
  }
})

const LEGS: [number, number][] = [
  [-0.62, -0.52],
  [0.62, -0.52],
  [-0.62, 0.52],
  [0.62, 0.52],
]
</script>

<template>
  <!-- 철제 작업대 -->
  <TresMesh
    v-for="([x, z], i) in LEGS"
    :key="i"
    :position="[x, 0.5, z]"
  >
    <TresBoxGeometry :args="[0.07, 0.9, 0.07]" />
    <TresMeshStandardMaterial
      :color="MACHINE_COLOR.steel"
      :metalness="0.6"
    />
  </TresMesh>
  <TresMesh :position="[0, 0.35, 0]">
    <TresBoxGeometry :args="[1.3, 0.04, 1.1]" />
    <TresMeshStandardMaterial :color="MACHINE_COLOR.dark" />
  </TresMesh>
  <TresMesh :position="[0, 0.97, 0]">
    <TresBoxGeometry :args="[1.4, 0.06, 1.2]" />
    <TresMeshStandardMaterial
      color="#4a525c"
      :metalness="0.5"
      :roughness="0.4"
    />
  </TresMesh>
  <!-- 부품 트레이(자석·베어링) -->
  <TresMesh :position="[-0.45, 1.03, -0.38]">
    <TresBoxGeometry :args="[0.36, 0.06, 0.3]" />
    <TresMeshStandardMaterial color="#1f6feb" />
  </TresMesh>
  <TresMesh
    v-for="i in 6"
    :key="i"
    :position="[-0.57 + ((i - 1) % 3) * 0.12, 1.08, -0.44 + Math.floor((i - 1) / 3) * 0.12]"
  >
    <TresCylinderGeometry :args="[0.035, 0.035, 0.04, 10]" />
    <TresMeshStandardMaterial
      color="#d0d7de"
      :metalness="0.9"
      :roughness="0.25"
    />
  </TresMesh>

  <!-- 로봇 팔 -->
  <TresGroup :position="[0.42, 1.0, -0.38]">
    <TresMesh :position="[0, 0.05, 0]">
      <TresCylinderGeometry :args="[0.15, 0.17, 0.1, 20]" />
      <TresMeshStandardMaterial :color="MACHINE_COLOR.dark" />
    </TresMesh>
    <TresGroup
      ref="turret"
      :position="[0, 0.1, 0]"
      :rotation="[0, REST.yaw, 0]"
    >
      <TresMesh :position="[0, 0.07, 0]">
        <TresCylinderGeometry :args="[0.12, 0.13, 0.14, 20]" />
        <TresMeshStandardMaterial
          :color="MACHINE_COLOR.robot"
          :roughness="0.45"
        />
      </TresMesh>
      <TresGroup
        ref="shoulder"
        :position="[0, 0.16, 0]"
        :rotation="[0, 0, REST.shoulder]"
      >
        <TresMesh :rotation="[Math.PI / 2, 0, 0]">
          <TresCylinderGeometry :args="[0.08, 0.08, 0.2, 16]" />
          <TresMeshStandardMaterial :color="MACHINE_COLOR.dark" />
        </TresMesh>
        <TresMesh :position="[0, 0.22, 0]">
          <TresBoxGeometry :args="[0.1, 0.44, 0.12]" />
          <TresMeshStandardMaterial
            :color="MACHINE_COLOR.robot"
            :roughness="0.45"
          />
        </TresMesh>
        <TresGroup
          ref="elbow"
          :position="[0, 0.44, 0]"
          :rotation="[0, 0, REST.elbow]"
        >
          <TresMesh :rotation="[Math.PI / 2, 0, 0]">
            <TresCylinderGeometry :args="[0.065, 0.065, 0.16, 16]" />
            <TresMeshStandardMaterial :color="MACHINE_COLOR.dark" />
          </TresMesh>
          <TresMesh :position="[0, 0.2, 0]">
            <TresBoxGeometry :args="[0.08, 0.38, 0.09]" />
            <TresMeshStandardMaterial
              :color="MACHINE_COLOR.robot"
              :roughness="0.45"
            />
          </TresMesh>
          <!-- 손목과 그리퍼 -->
          <TresMesh :position="[0, 0.42, 0]">
            <TresCylinderGeometry :args="[0.045, 0.045, 0.08, 12]" />
            <TresMeshStandardMaterial :color="MACHINE_COLOR.dark" />
          </TresMesh>
          <TresMesh
            v-for="side in [-1, 1]"
            :key="side"
            :position="[0, 0.5, side * 0.035]"
          >
            <TresBoxGeometry :args="[0.03, 0.09, 0.02]" />
            <TresMeshStandardMaterial
              :color="MACHINE_COLOR.steel"
              :metalness="0.8"
            />
          </TresMesh>
        </TresGroup>
      </TresGroup>
    </TresGroup>
  </TresGroup>
</template>
