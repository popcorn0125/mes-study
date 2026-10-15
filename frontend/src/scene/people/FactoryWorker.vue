<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import type { Group } from 'three'
import type { WorkerRole } from '../machines/kinds'
import { useEquipmentFrame } from '../machines/useEquipmentFrame'

/**
 * 설비 곁의 사람. 담당 설비 상태를 따라 움직인다.
 * - operator(작업자)·inspector(검사원): 설비가 가동 중이면 손을 움직여 작업하고, 아니면 가만히 서 있다.
 * - technician(정비사): 설비가 고장·예방정비 중일 때만 나타나 공구질을 한다.
 * 모델 앞쪽은 +z다. 설비를 바라보도록 rotationY로 돌려 놓는다.
 */
const props = defineProps<{
  equipmentId: string
  role: WorkerRole
  position: [number, number, number]
  rotationY: number
}>()

const OUTFIT: Record<WorkerRole, { body: string; hat: string; pants: string }> = {
  operator: { body: '#f0883e', hat: '#f2cc60', pants: '#30363d' },
  inspector: { body: '#e6edf3', hat: '#ffffff', pants: '#484f58' },
  technician: { body: '#1f6feb', hat: '#e6edf3', pants: '#1f3a66' },
}
const outfit = computed(() => OUTFIT[props.role])
const SKIN = '#e0b48c'

const root = shallowRef<Group>()
const leftArm = shallowRef<Group>()
const rightArm = shallowRef<Group>()
const torso = shallowRef<Group>()
let phase = Math.random() * 10

useEquipmentFrame(props.equipmentId, (eq, { dt, elapsed }) => {
  if (!root.value || !leftArm.value || !rightArm.value || !torso.value) return
  const repairing = eq.status === 'DOWN' || eq.status === 'PM'

  if (props.role === 'technician') {
    root.value.visible = repairing
    if (!repairing) return
    // 정지 중에도 수리는 계속되는 것처럼 보이도록 실제 시간으로 움직인다
    torso.value.rotation.x = 0.35
    rightArm.value.rotation.x = -1.3 + 0.45 * Math.sin(elapsed * 9)
    leftArm.value.rotation.x = -0.9
    return
  }

  const working = eq.status === 'RUN'
  phase += dt * (props.role === 'inspector' ? 3 : 6)
  const target = working
    ? { left: -1.0 + 0.25 * Math.sin(phase), right: -1.0 + 0.25 * Math.sin(phase + Math.PI), lean: 0.12 }
    : { left: -0.05, right: 0.05, lean: 0 }
  // 자세가 바뀔 때 툭 끊기지 않게 부드럽게 따라간다
  const k = Math.min(1, (dt || 1 / 60) * 8)
  leftArm.value.rotation.x += (target.left - leftArm.value.rotation.x) * k
  rightArm.value.rotation.x += (target.right - rightArm.value.rotation.x) * k
  torso.value.rotation.x += (target.lean - torso.value.rotation.x) * k
})
</script>

<template>
  <TresGroup
    ref="root"
    :position="position"
    :rotation="[0, rotationY, 0]"
    :visible="role !== 'technician'"
  >
    <!-- 다리 -->
    <TresMesh
      v-for="side in [-1, 1]"
      :key="side"
      :position="[side * 0.08, 0.38, 0]"
    >
      <TresCapsuleGeometry :args="[0.065, 0.62, 4, 8]" />
      <TresMeshStandardMaterial :color="outfit.pants" />
    </TresMesh>
    <!-- 상체(허리를 축으로 숙인다) -->
    <TresGroup
      ref="torso"
      :position="[0, 0.76, 0]"
    >
      <TresMesh :position="[0, 0.27, 0]">
        <TresCapsuleGeometry :args="[0.15, 0.28, 4, 12]" />
        <TresMeshStandardMaterial
          :color="outfit.body"
          :roughness="0.8"
        />
      </TresMesh>
      <!-- 안전 조끼 반사띠 -->
      <TresMesh
        v-if="role !== 'inspector'"
        :position="[0, 0.22, 0]"
      >
        <TresCylinderGeometry :args="[0.155, 0.155, 0.04, 16]" />
        <TresMeshStandardMaterial
          color="#d0d7de"
          emissive="#d0d7de"
          :emissive-intensity="0.3"
        />
      </TresMesh>
      <TresMesh :position="[0, 0.66, 0]">
        <TresSphereGeometry :args="[0.11, 16, 12]" />
        <TresMeshStandardMaterial :color="SKIN" />
      </TresMesh>
      <!-- 안전모 -->
      <TresMesh :position="[0, 0.7, 0]">
        <TresSphereGeometry :args="[0.125, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]" />
        <TresMeshStandardMaterial
          :color="outfit.hat"
          :roughness="0.4"
        />
      </TresMesh>
      <TresMesh :position="[0, 0.7, 0.03]">
        <TresCylinderGeometry :args="[0.15, 0.15, 0.015, 16]" />
        <TresMeshStandardMaterial :color="outfit.hat" />
      </TresMesh>
      <!-- 팔(어깨를 축으로 앞으로 든다) -->
      <TresGroup
        ref="leftArm"
        :position="[-0.2, 0.46, 0]"
      >
        <TresMesh :position="[0, -0.2, 0]">
          <TresCapsuleGeometry :args="[0.05, 0.3, 4, 8]" />
          <TresMeshStandardMaterial :color="outfit.body" />
        </TresMesh>
      </TresGroup>
      <TresGroup
        ref="rightArm"
        :position="[0.2, 0.46, 0]"
      >
        <TresMesh :position="[0, -0.2, 0]">
          <TresCapsuleGeometry :args="[0.05, 0.3, 4, 8]" />
          <TresMeshStandardMaterial :color="outfit.body" />
        </TresMesh>
        <!-- 정비사는 렌치, 검사원은 태블릿을 든다 -->
        <TresMesh
          v-if="role === 'technician'"
          :position="[0, -0.42, 0.04]"
        >
          <TresBoxGeometry :args="[0.03, 0.2, 0.03]" />
          <TresMeshStandardMaterial
            color="#8b949e"
            :metalness="0.9"
          />
        </TresMesh>
        <TresMesh
          v-if="role === 'inspector'"
          :position="[0, -0.4, 0.06]"
          :rotation="[0.3, 0, 0]"
        >
          <TresBoxGeometry :args="[0.16, 0.2, 0.015]" />
          <TresMeshStandardMaterial
            color="#161b22"
            emissive="#58a6ff"
            :emissive-intensity="0.4"
          />
        </TresMesh>
      </TresGroup>
    </TresGroup>
    <!-- 정비사 공구함 -->
    <TresMesh
      v-if="role === 'technician'"
      :position="[0.3, 0.1, 0.15]"
    >
      <TresBoxGeometry :args="[0.3, 0.2, 0.16]" />
      <TresMeshStandardMaterial color="#da3633" />
    </TresMesh>
  </TresGroup>
</template>
