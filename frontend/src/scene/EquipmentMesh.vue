<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useLoop, type TresPointerEvent } from '@tresjs/core'
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import type { EquipmentStatus, SensorLevel } from '@/domain/types'
import { useSelectionStore } from '@/stores/selection'
import { useSimStore } from '@/stores/sim'
import { formatDuration } from '@/ui/format'
import { EQUIPMENT_STATUS_STYLE, SENSOR_LEVEL_STYLE } from './colors'
import { EQUIPMENT_SIZE, type Vec3 } from './layout'
import CncMachine from './machines/CncMachine.vue'
import GenericMachine from './machines/GenericMachine.vue'
import InspectionStation from './machines/InspectionStation.vue'
import { machineKind, operatorRole, type MachineKind } from './machines/kinds'
import PackingMachine from './machines/PackingMachine.vue'
import RobotCell from './machines/RobotCell.vue'
import WinderMachine from './machines/WinderMachine.vue'
import FactoryWorker from './people/FactoryWorker.vue'
import { hoverCursor } from './pointer'
import SceneLabel from './SceneLabel.vue'
import SelectionRing from './SelectionRing.vue'

const props = defineProps<{
  id: string
  name: string
  position: Vec3
}>()

const sim = useSimStore()
const selection = useSelectionStore()
const selected = computed(() => selection.isSelected('equipment', props.id))

function onClick(event: TresPointerEvent) {
  event.stopPropagation()
  selection.select({ kind: 'equipment', id: props.id })
}

const MODELS: Record<MachineKind, unknown> = {
  cnc: CncMachine,
  winder: WinderMachine,
  robot: RobotCell,
  inspection: InspectionStation,
  packer: PackingMachine,
  generic: GenericMachine,
}
const kind = computed(() => machineKind(sim.state.equipment.find((e) => e.id === props.id)?.workCenterId ?? ''))

const STATUS_ICON: Partial<Record<EquipmentStatus, string>> = {
  STARVED_MATERIAL: '📦 ',
  DOWN: '⚠ ',
  PM: '🔧 ',
}

// 라벨은 UI 주기(250ms)로 갱신해도 충분하다. 매번 새 객체를 돌려줘야 화면이 갱신된다.
const label = computed(() => {
  const eq = sim.state.equipment.find((e) => e.id === props.id)
  if (!eq) return null
  const style = EQUIPMENT_STATUS_STYLE[eq.status]
  const downtime = eq.status === 'DOWN' || eq.status === 'PM' ? ` (${formatDuration(eq.downRemaining)} 남음)` : ''
  return {
    status: `${STATUS_ICON[eq.status] ?? ''}${style.label}${downtime}`,
    statusColor: style.color,
    sensor: eq.sensor && {
      temperature: `${eq.sensor.temperature.toFixed(0)}°C`,
      temperatureColor: SENSOR_LEVEL_STYLE[eq.sensor.temperatureLevel].color,
      vibration: `${eq.sensor.vibration.toFixed(1)}mm/s`,
      vibrationColor: SENSOR_LEVEL_STYLE[eq.sensor.vibrationLevel].color,
    },
  }
})

/**
 * 경광등(위에서부터 빨강·노랑·초록·파랑). 실제 라인처럼 상태를 색으로 알린다.
 * 가동 = 초록, 대기·막힘·자재 부족 = 노랑, 고장 = 빨강 점멸, 예방정비 = 파랑, 유휴 = 모두 꺼짐.
 */
const TOWER_LAMPS = ['#f85149', '#d29922', '#3fb950', '#2f81f7'] as const
const LAMP_OF_STATUS: Record<EquipmentStatus, number | null> = {
  DOWN: 0,
  STARVED: 1,
  BLOCKED: 1,
  STARVED_MATERIAL: 1,
  RUN: 2,
  PM: 3,
  IDLE: null,
}

// 바닥 띠·경광등·경보 링·흔들림은 매 프레임 엔진 상태를 직접 읽어 반영한다.
const body = shallowRef<Group>()
const stripMaterial = shallowRef<MeshStandardMaterial>()
const lampMaterials = shallowRef<MeshStandardMaterial[]>([])
const alarmRing = shallowRef<Mesh>()
const alarmMaterial = shallowRef<MeshBasicMaterial>()
let shownStatus: EquipmentStatus | null = null
let shownLevel: SensorLevel | null = null

const { onBeforeRender } = useLoop()
onBeforeRender(({ elapsed }) => {
  const eq = sim.getEngine().state.equipment.find((e) => e.id === props.id)
  if (!eq || !stripMaterial.value) return

  const blink = eq.status === 'DOWN' ? 0.25 + 0.75 * Math.abs(Math.sin(elapsed * 5)) : 1
  if (eq.status !== shownStatus) {
    const color = EQUIPMENT_STATUS_STYLE[eq.status].color
    stripMaterial.value.color.set(color)
    stripMaterial.value.emissive.set(color)
    shownStatus = eq.status
  }
  stripMaterial.value.emissiveIntensity = 0.9 * blink
  const lit = LAMP_OF_STATUS[eq.status]
  lampMaterials.value.forEach((material, i) => {
    material.emissiveIntensity = i === lit ? 2 * blink : 0.04
  })

  // 센서 경고: 바닥 링이 맥박처럼 커졌다 작아진다(위험이면 더 빠르게)
  const level = eq.sensor?.level ?? 'NORMAL'
  if (alarmRing.value && alarmMaterial.value) {
    alarmRing.value.visible = level !== 'NORMAL'
    if (level !== shownLevel) {
      alarmMaterial.value.color.set(SENSOR_LEVEL_STYLE[level].color)
      shownLevel = level
    }
    const speed = level === 'CRITICAL' ? 8 : 3
    alarmRing.value.scale.setScalar(1 + 0.15 * Math.sin(elapsed * speed))
  }

  // 진동 위험 구간에서 가동 중이면 설비가 미세하게 흔들린다
  if (body.value) {
    const shaking = eq.status === 'RUN' && eq.sensor?.vibrationLevel === 'CRITICAL'
    body.value.position.x = shaking ? Math.sin(elapsed * 60) * 0.03 : 0
  }
})

function setLampMaterial(index: number, material: unknown) {
  if (material) lampMaterials.value[index] = material as MeshStandardMaterial
}

/** 설비 그룹의 원점은 설비 상자 중심이므로, 모델·사람은 바닥(y = -높이/2) 기준으로 놓는다. */
const floorY = -EQUIPMENT_SIZE[1] / 2
const HITBOXES: { position: Vec3; size: Vec3 }[] = [
  { position: [0, floorY + 0.5, 0], size: [1.5, 1.0, 1.3] },
  { position: [0, floorY + 1.55, -0.43], size: [1.5, 1.1, 0.45] },
]
</script>

<template>
  <TresGroup :position="position">
    <TresGroup :position="[0, floorY, 0]">
      <TresGroup ref="body">
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
      <SelectionRing
        v-if="selected"
        :radius="1.05"
      />
      <TresMesh
        ref="alarmRing"
        :rotation="[-Math.PI / 2, 0, 0]"
        :position="[0, 0.02, 0]"
        :visible="false"
      >
        <TresRingGeometry :args="[1.25, 1.4, 48]" />
        <TresMeshBasicMaterial
          ref="alarmMaterial"
          transparent
          :opacity="0.85"
        />
      </TresMesh>
    </TresGroup>
    <!-- 클릭 판정용 투명 상자. 작업대 위 가운데(가공 중인 작업물 자리)는 비워 작업물을 따로 클릭할 수 있게 한다. -->
    <TresMesh
      v-for="(box, i) in HITBOXES"
      :key="i"
      :position="box.position"
      @click="onClick"
      @pointerenter="hoverCursor.enter"
      @pointerleave="hoverCursor.leave"
    >
      <TresBoxGeometry :args="box.size" />
      <TresMeshBasicMaterial
        transparent
        :opacity="0"
        :depth-write="false"
        :color-write="false"
      />
    </TresMesh>
    <SceneLabel :position="[0, 2.35, 0]">
      <div
        v-if="label"
        class="scene-label"
      >
        <strong>{{ name }}</strong>
        <span :style="{ color: label.statusColor }">● {{ label.status }}</span>
        <span
          v-if="label.sensor"
          class="scene-label__sensor"
        >
          <span :style="{ color: label.sensor.temperatureColor }">🌡 {{ label.sensor.temperature }}</span>
          <span :style="{ color: label.sensor.vibrationColor }">〰 {{ label.sensor.vibration }}</span>
        </span>
      </div>
    </SceneLabel>
  </TresGroup>
</template>
