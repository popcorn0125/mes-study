<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { workCenterUtilization } from '@/domain/kpi'
import { useScenarioStore } from '@/stores/scenario'
import { useSelectionStore } from '@/stores/selection'
import { useSimStore } from '@/stores/sim'
import { useViewStore } from '@/stores/view'
import { createNameLookup } from '@/ui/format'
import BufferShelf from './BufferShelf.vue'
import { heatColor } from './colors'
import MaterialRack from './MaterialRack.vue'
import EquipmentMesh from './EquipmentMesh.vue'
import UnitMovers from './UnitMovers.vue'
import {
  WORK_CENTER_SPACING,
  conveyorSegments,
  equipmentPositions,
  scrapPosition,
  shelfPosition,
  shippingPosition,
  warehousePosition,
  workCenterX,
} from './layout'
import { hoverCursor } from './pointer'
import AgvCart from './props/AgvCart.vue'
import ConveyorBelt from './props/ConveyorBelt.vue'
import FactoryFloor from './props/FactoryFloor.vue'
import ScrapBin from './props/ScrapBin.vue'
import ShippingDock from './props/ShippingDock.vue'
import SceneLabel from './SceneLabel.vue'

const sim = useSimStore()
const selection = useSelectionStore()
const view = useViewStore()
const scenario = useScenarioStore()

const ZONE_COLOR = '#1b232d'

// ── 카메라 ────────────────────────────────────────────────
// 왼쪽 패널(작업지시·이벤트 로그)을 피해 라인이 화면 오른쪽 영역에 오도록 시점 중심을 왼쪽으로 옮긴다.
const CAMERA_TARGET: [number, number, number] = [-6, 0, 0]
const CAMERA_POSITION: [number, number, number] = [-6, 18, 26]
/** 이동(팬)으로 시점 중심이 공장 밖으로 나가지 않게 하는 범위 */
const TARGET_BOUNDS = { minX: -22, maxX: 18, minZ: -8, maxZ: 8 }

/** cientos OrbitControls가 노출하는 three-stdlib OrbitControls 중 쓰는 부분 */
interface Vec3Like {
  x: number
  y: number
  z: number
  set: (x: number, y: number, z: number) => void
}
interface OrbitControlsInstance {
  zoomToCursor: boolean
  target: Vec3Like
  object: { position: Vec3Like }
  update: () => void
}

const controls = shallowRef<{ instance: OrbitControlsInstance | null }>()

// 휠 확대/축소를 화면 중심이 아니라 마우스 커서 위치를 향해 하도록 한다(설비를 짚어 확대).
watch(
  () => controls.value?.instance,
  (instance) => {
    if (instance) instance.zoomToCursor = true
  },
)

/**
 * 시점 중심을 공장 범위 안(바닥 높이)으로 제한한다.
 * 중심만 되돌리면 카메라가 바라보는 방향이 틀어지므로, 카메라도 같은 만큼 옮겨 "이동만 멈추게" 한다.
 */
function clampTarget() {
  const instance = controls.value?.instance
  if (!instance) return
  const { target, object } = instance
  const x = Math.min(TARGET_BOUNDS.maxX, Math.max(TARGET_BOUNDS.minX, target.x))
  const z = Math.min(TARGET_BOUNDS.maxZ, Math.max(TARGET_BOUNDS.minZ, target.z))
  const dx = x - target.x
  const dy = 0 - target.y
  const dz = z - target.z
  if (dx === 0 && dy === 0 && dz === 0) return
  target.set(x, 0, z)
  const p = object.position
  p.set(p.x + dx, p.y + dy, p.z + dz)
}

function resetCamera() {
  const instance = controls.value?.instance
  if (!instance) return
  instance.target.set(...CAMERA_TARGET)
  instance.object.position.set(...CAMERA_POSITION)
  instance.update()
}

// 하단 "시점 초기화" 버튼, 그리고 랜딩(자동 회전)에서 빠져나올 때 처음 시점으로 되돌린다.
watch(() => view.cameraResetRequest, resetCamera)
watch(
  () => scenario.phase,
  (phase, prev) => {
    if (prev === 'landing' && phase !== 'landing') resetCamera()
  },
)

const workCenters = computed(() => {
  const list = sim.master.workCenters
  return list.map((wc, i) => {
    // 히트맵: 작업장 평균 가동률로 바닥을 칠한다
    const utilization = workCenterUtilization(sim.state, wc.id)
    return {
      ...wc,
      x: workCenterX(i, list.length),
      shelf: shelfPosition(i, list.length),
      floorColor: view.heatmap ? heatColor(utilization) : ZONE_COLOR,
      utilization: `${Math.round(utilization * 100)}%`,
    }
  })
})

// 설비 목록은 실행 데이터 기준(사용자가 설비를 추가하면 늘어난다)
const equipment = computed(() => {
  const positions = equipmentPositions(
    sim.master.workCenters.map((wc) => wc.id),
    sim.state.equipment,
  )
  const names = createNameLookup(sim.master)
  return sim.state.equipment.map((eq) => ({
    id: eq.id,
    name: names.equipment(eq.id),
    position: positions.get(eq.id)!,
  }))
})

const wcCount = computed(() => sim.master.workCenters.length)
const warehouse = computed(() => warehousePosition(wcCount.value))
const shipping = computed(() => shippingPosition(wcCount.value))
const scrap = scrapPosition()
const lineLength = computed(() => (wcCount.value + 1) * WORK_CENTER_SPACING)
const conveyors = computed(() => conveyorSegments(wcCount.value))
// AGV는 BOM 자재를 쓰는 작업장의 버퍼 앞에 들른다
const agvStops = computed(() => {
  const ids = sim.master.workCenters.map((wc) => wc.id)
  const consuming = new Set(sim.master.bom.map((line) => line.workCenterId))
  return ids.flatMap((id, i) => (consuming.has(id) ? [shelfPosition(i, ids.length)[0]] : []))
})
</script>

<template>
  <TresCanvas
    clear-color="#0b0f14"
    window-size
    @pointermissed="selection.clear()"
  >
    <TresPerspectiveCamera
      :position="CAMERA_POSITION"
      :fov="50"
      :look-at="CAMERA_TARGET"
    />
    <!-- 왼쪽 드래그: 회전 · 휠: 커서 기준 확대/축소 · 오른쪽 드래그: 이동 -->
    <OrbitControls
      ref="controls"
      make-default
      :target="CAMERA_TARGET"
      :auto-rotate="scenario.phase === 'landing'"
      :auto-rotate-speed="0.6"
      enable-damping
      :damping-factor="0.12"
      :zoom-speed="1.2"
      enable-pan
      screen-space-panning
      :max-polar-angle="Math.PI / 2.2"
      :min-distance="3"
      :max-distance="60"
      @change="clampTarget"
    />
    <TresAmbientLight :intensity="0.45" />
    <TresHemisphereLight :args="['#c9d8ea', '#1a1f26', 0.6]" />
    <TresDirectionalLight
      :position="[6, 14, 8]"
      :intensity="1.5"
    />
    <TresDirectionalLight
      :position="[-10, 8, -6]"
      :intensity="0.4"
    />

    <!-- 바닥·통로·기둥과 컨베이어 -->
    <FactoryFloor
      :line-start="-lineLength / 2 - 2"
      :line-end="lineLength / 2 + 2"
    />
    <ConveyorBelt
      v-for="[from, to] in conveyors"
      :key="from"
      :from="from"
      :to="to"
    />
    <AgvCart
      :start-x="warehouse[0]"
      :stop-xs="agvStops"
    />

    <!-- 작업장 구역 -->
    <TresGroup
      v-for="wc in workCenters"
      :key="wc.id"
    >
      <TresMesh
        :rotation="[-Math.PI / 2, 0, 0]"
        :position="[wc.x - 0.6, 0.003, 0]"
        @click="selection.select({ kind: 'workCenter', id: wc.id })"
        @pointerenter="hoverCursor.enter"
        @pointerleave="hoverCursor.leave"
      >
        <TresPlaneGeometry :args="[4.4, 5]" />
        <TresMeshStandardMaterial :color="wc.floorColor" />
      </TresMesh>
      <SceneLabel :position="[wc.x - 0.6, 0, 2.9]">
        <div class="scene-label scene-label--zone">
          {{ wc.name }}<span v-if="view.heatmap"> · 가동률 {{ wc.utilization }}</span>
        </div>
      </SceneLabel>
      <BufferShelf
        :work-center-id="wc.id"
        :capacity="wc.inBufferCap"
        :position="wc.shelf"
      />
    </TresGroup>

    <EquipmentMesh
      v-for="eq in equipment"
      :id="eq.id"
      :key="eq.id"
      :name="eq.name"
      :position="eq.position"
    />

    <!-- 자재 창고(자재별 재고 막대) · 출하장 · 폐기함 -->
    <MaterialRack :position="[warehouse[0], 0, 0]" />
    <SceneLabel :position="[warehouse[0], 0, 3.4]">
      <div class="scene-label scene-label--zone">
        자재 창고
      </div>
    </SceneLabel>

    <ShippingDock
      :position="shipping"
      :completed="sim.state.counters.completed"
    />
    <SceneLabel :position="[shipping[0], 0, 1.4]">
      <div class="scene-label scene-label--zone">
        출하장 · 양품 {{ sim.state.counters.completed }}
      </div>
    </SceneLabel>

    <ScrapBin :position="scrap" />
    <SceneLabel :position="[scrap[0], 0, scrap[2] + 1]">
      <div class="scene-label scene-label--zone">
        폐기함 · 불량 {{ sim.state.counters.scrapped }}
      </div>
    </SceneLabel>

    <UnitMovers />
  </TresCanvas>
</template>
