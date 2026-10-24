<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { TresCanvas } from '@tresjs/core'
import { OrbitControls } from '@tresjs/cientos'
import { BUFFER_CAPACITY, PRODUCER_EQUIPMENT } from '@/producer/equipment'
import { findLog, useSensorLogs } from '@/producer/useSensorProducer'
import BufferShelf from './BufferShelf.vue'
import MaterialRack from './MaterialRack.vue'
import EquipmentMesh from './EquipmentMesh.vue'
import {
  WORK_CENTER_SPACING,
  conveyorSegments,
  equipmentPosition,
  scrapPosition,
  shelfPosition,
  shippingPosition,
  warehousePosition,
  workCenterX,
} from './layout'
import AgvCart from './props/AgvCart.vue'
import ConveyorBelt from './props/ConveyorBelt.vue'
import FactoryFloor from './props/FactoryFloor.vue'
import ScrapBin from './props/ScrapBin.vue'
import ShippingDock from './props/ShippingDock.vue'
import SceneLabel from './SceneLabel.vue'

const logs = useSensorLogs()

const ZONE_COLOR = '#1b232d'

// ── 카메라 ────────────────────────────────────────────────
const CAMERA_TARGET: [number, number, number] = [0, 0, 0]
const CAMERA_POSITION: [number, number, number] = [0, 18, 26]
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

// 설비 1대가 작업장 하나를 맡는다(라인 순서)
const wcCount = PRODUCER_EQUIPMENT.length
const stations = PRODUCER_EQUIPMENT.map((eq, i) => ({
  ...eq,
  x: workCenterX(i, wcCount),
  shelf: shelfPosition(i, wcCount),
  position: equipmentPosition(i, wcCount, 0, 1),
}))

const warehouse = warehousePosition(wcCount)
const shipping = shippingPosition(wcCount)
const scrap = scrapPosition()
const lineLength = (wcCount + 1) * WORK_CENTER_SPACING
const conveyors = conveyorSegments(wcCount)
// AGV는 자재를 쓰는 작업장의 버퍼 앞에 들른다
const agvStops = stations.filter((s) => s.usesMaterials).map((s) => s.shelf[0])

// 출하장 = 마지막 공정(포장)의 양품, 폐기함 = 모든 설비의 불량 합계
const shipped = computed(() => findLog(logs.value, PRODUCER_EQUIPMENT[wcCount - 1].id)?.production.goodCount ?? 0)
const scrapped = computed(() => logs.value.reduce((sum, log) => sum + log.production.badCount, 0))
</script>

<template>
  <TresCanvas
    clear-color="#0b0f14"
    window-size
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
      v-for="wc in stations"
      :key="wc.id"
    >
      <TresMesh
        :rotation="[-Math.PI / 2, 0, 0]"
        :position="[wc.x - 0.6, 0.003, 0]"
      >
        <TresPlaneGeometry :args="[4.4, 5]" />
        <TresMeshStandardMaterial :color="ZONE_COLOR" />
      </TresMesh>
      <SceneLabel :position="[wc.x - 0.6, 0, 2.9]">
        <div class="scene-label scene-label--zone">
          {{ wc.workCenterName }}
        </div>
      </SceneLabel>
      <BufferShelf
        :capacity="BUFFER_CAPACITY"
        :position="wc.shelf"
      />
    </TresGroup>

    <EquipmentMesh
      v-for="eq in stations"
      :id="eq.id"
      :key="eq.id"
      :name="eq.name"
      :kind="eq.kind"
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
      :completed="shipped"
    />
    <SceneLabel :position="[shipping[0], 0, 1.4]">
      <div class="scene-label scene-label--zone">
        출하장 · 양품 {{ shipped }}
      </div>
    </SceneLabel>

    <ScrapBin :position="scrap" />
    <SceneLabel :position="[scrap[0], 0, scrap[2] + 1]">
      <div class="scene-label scene-label--zone">
        폐기함 · 불량 {{ scrapped }}
      </div>
    </SceneLabel>
  </TresCanvas>
</template>
