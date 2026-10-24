<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useLoop } from '@tresjs/core'
import type { MeshStandardMaterial } from 'three'
import type { SensorStatus } from '@/producer/generate'
import { findLog, useSensorLogs } from '@/producer/useSensorProducer'
import { SENSOR_LEVEL_STYLE } from './colors'
import { EQUIPMENT_SIZE, type Vec3 } from './layout'
import CncMachine from './machines/CncMachine.vue'
import GenericMachine from './machines/GenericMachine.vue'
import InspectionStation from './machines/InspectionStation.vue'
import { operatorRole, type MachineKind } from './machines/kinds'
import PackingMachine from './machines/PackingMachine.vue'
import RobotCell from './machines/RobotCell.vue'
import WinderMachine from './machines/WinderMachine.vue'
import FactoryWorker from './people/FactoryWorker.vue'
import SceneLabel from './SceneLabel.vue'

const props = defineProps<{
  id: string
  name: string
  kind: MachineKind
  position: Vec3
}>()

const logs = useSensorLogs()
const MODELS: Record<MachineKind, unknown> = {
  cnc: CncMachine,
  winder: WinderMachine,
  robot: RobotCell,
  inspection: InspectionStation,
  packer: PackingMachine,
  generic: GenericMachine,
}

/** 상태 색과 표시 이름. 색만으로 구분하지 않도록 라벨에도 이름을 함께 쓴다. */
const STATUS_STYLE: Record<SensorStatus, { color: string; label: string }> = {
  RUN: { color: '#3fb950', label: '가동' },
  WARN: { color: '#d29922', label: '경고' },
  DOWN: { color: '#f85149', label: '고장' },
}

// 더미 데이터의 측정값은 늘 정상 범위 안이므로 정상 색으로 보여 준다.
const NORMAL_COLOR = SENSOR_LEVEL_STYLE.NORMAL.color

// 라벨은 로그가 바뀌는 1초마다 갱신된다.
const label = computed(() => {
  const log = findLog(logs.value, props.id)
  if (!log) return null
  const style = STATUS_STYLE[log.status]
  return {
    status: `${log.status === 'RUN' ? '' : '⚠ '}${style.label}`,
    statusColor: style.color,
    sensor: {
      temperature: `${log.metrics.temperature.toFixed(0)}°C`,
      vibration: `${log.metrics.vibration.toFixed(1)}mm/s`,
    },
  }
})

/**
 * 경광등(위에서부터 빨강·노랑·초록·파랑). 실제 라인처럼 상태를 색으로 알린다.
 * 가동 = 초록, 경고 = 노랑, 고장 = 빨강 점멸.
 */
const TOWER_LAMPS = ['#f85149', '#d29922', '#3fb950', '#2f81f7'] as const
const LAMP_OF_STATUS: Record<SensorStatus, number> = {
  DOWN: 0,
  WARN: 1,
  RUN: 2,
}

// 바닥 띠·경광등은 매 프레임 최신 로그를 읽어 반영한다.
const stripMaterial = shallowRef<MeshStandardMaterial>()
const lampMaterials = shallowRef<MeshStandardMaterial[]>([])
let shownStatus: SensorStatus | null = null

const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed }) => {
  const log = findLog(logs.value, props.id)
  if (!log || !stripMaterial.value) return

  const blink = log.status === 'DOWN' ? 0.25 + 0.75 * Math.abs(Math.sin(elapsed * 5)) : 1
  if (log.status !== shownStatus) {
    const color = STATUS_STYLE[log.status].color
    stripMaterial.value.color.set(color)
    stripMaterial.value.emissive.set(color)
    shownStatus = log.status
  }
  stripMaterial.value.emissiveIntensity = 0.9 * blink
  const lit = LAMP_OF_STATUS[log.status]
  lampMaterials.value.forEach((material, i) => {
    material.emissiveIntensity = i === lit ? 2 * blink : 0.04
  })
})

function setLampMaterial(index: number, material: unknown) {
  if (material) lampMaterials.value[index] = material as MeshStandardMaterial
}

/** 설비 그룹의 원점은 설비 상자 중심이므로, 모델·사람은 바닥(y = -높이/2) 기준으로 놓는다. */
const floorY = -EQUIPMENT_SIZE[1] / 2
</script>

<template>
  <TresGroup :position="position">
    <TresGroup :position="[0, floorY, 0]">
      <TresGroup>
        <component
          :is="MODELS[kind]"
          :equipment-id="id"
        />
        <!-- 경광등 -->
        <TresGroup :position="[0.6, 0, -0.5]">
          <TresMesh :position="[0, 1.55, 0]">
            <TresCylinderGeometry :args="[0.02, 0.02, 1.1, 8]" />
            <TresMeshStandardMaterial color="#6e7681" />
          </TresMesh>
          <TresMesh
            v-for="(color, i) in TOWER_LAMPS"
            :key="color"
            :position="[0, 2.45 - i * 0.11, 0]"
          >
            <TresCylinderGeometry :args="[0.07, 0.07, 0.1, 16]" />
            <TresMeshStandardMaterial
              :ref="(m: unknown) => setLampMaterial(i, m)"
              :color="color"
              :emissive="color"
              :emissive-intensity="0.04"
              transparent
              :opacity="0.9"
            />
          </TresMesh>
        </TresGroup>
      </TresGroup>
      <!-- 상태색 바닥 띠 -->
      <TresMesh :position="[0, 0.05, 0]">
        <TresBoxGeometry :args="[1.46, 0.1, 1.26]" />
        <TresMeshStandardMaterial
          ref="stripMaterial"
          :roughness="0.5"
        />
      </TresMesh>
      <FactoryWorker
        :equipment-id="id"
        :role="operatorRole(kind)"
        :position="[0.15, 0, 0.98]"
        :rotation-y="Math.PI"
      />
      <FactoryWorker
        :equipment-id="id"
        role="technician"
        :position="[1.05, 0, 0.6]"
        :rotation-y="-Math.PI / 2"
      />
    </TresGroup>
    <SceneLabel :position="[0, 2.35, 0]">
      <div
        v-if="label"
        class="scene-label"
      >
        <strong>{{ name }}</strong>
        <span :style="{ color: label.statusColor }">● {{ label.status }}</span>
        <span class="scene-label__sensor">
          <span :style="{ color: NORMAL_COLOR }">🌡 {{ label.sensor.temperature }}</span>
          <span :style="{ color: NORMAL_COLOR }">〰 {{ label.sensor.vibration }}</span>
        </span>
      </div>
    </SceneLabel>
  </TresGroup>
</template>
