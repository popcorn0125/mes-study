<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { useLoop } from '@tresjs/core'
import {
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { SimEngine } from '@/sim/engine'
import { useSimStore } from '@/stores/sim'
import { DEFAULT_ITEM_COLOR, ITEM_COLOR, SCRAP_COLOR } from './colors'
import {
  UNIT_SIZE,
  bufferSlotPosition,
  equipmentPositions,
  scrapPosition,
  shippingPosition,
  unitOnEquipmentPosition,
  warehousePosition,
  type Vec3,
} from './layout'

/**
 * 라인 위 Unit(재공품)들을 InstancedMesh 하나로 그린다.
 * 엔진은 Unit을 버퍼/설비 사이에서 즉시 옮기므로, 화면에서는 목표 위치로 부드럽게 따라가게 해 이동을 표현한다.
 */
const MAX_UNITS = 256
/** 클수록 목표 위치를 빨리 따라간다(초당 감쇠율) */
const FOLLOW_RATE = 8
const ARRIVE_DISTANCE = 0.15

/** 모터 모양: 원통 하우징 + 윗면 축. 크기는 UNIT_SIZE 정육면체 안에 들어간다(버퍼 적재 간격 유지). */
const housing = new CylinderGeometry(UNIT_SIZE * 0.45, UNIT_SIZE * 0.45, UNIT_SIZE * 0.8, 16).translate(0, -UNIT_SIZE * 0.1, 0)
const shaft = new CylinderGeometry(UNIT_SIZE * 0.08, UNIT_SIZE * 0.08, UNIT_SIZE * 0.2, 8).translate(0, UNIT_SIZE * 0.4, 0)
const geometry = mergeGeometries([housing, shaft])
housing.dispose()
shaft.dispose()
const material = new MeshStandardMaterial({ roughness: 0.35, metalness: 0.45 })
const mesh = new InstancedMesh(geometry, material, MAX_UNITS)
mesh.instanceMatrix.setUsage(DynamicDrawUsage)
mesh.setColorAt(0, new Color()) // instanceColor 버퍼를 첫 렌더 전에 만들어 둔다
mesh.count = 0
mesh.frustumCulled = false

interface Visual {
  position: Vector3
  itemId: string
  /** 라인을 떠나는 중이면 도착지 */
  exit: 'SHIPPING' | 'SCRAP' | null
}

const visuals = new Map<string, Visual>()
const matrix = new Matrix4()
const color = new Color()
const target = new Vector3()
let lastEngine: SimEngine | null = null

const sim = useSimStore()
const { onBeforeRender } = useLoop()

onBeforeRender(({ delta }) => {
  const engine = sim.getEngine()
  if (engine !== lastEngine) {
    visuals.clear() // 리셋되면 화면의 Unit도 비운다
    lastEngine = engine
  }
  const { state, master } = engine
  const wcIds = master.workCenters.map((wc) => wc.id)
  const wcCount = wcIds.length

  // 1. 이번 프레임의 목표 위치: 버퍼 slot 또는 설비 위
  const targets = new Map<string, Vec3>()
  wcIds.forEach((wcId, wcIndex) => {
    state.buffers[wcId].forEach((unitId, slot) => targets.set(unitId, bufferSlotPosition(wcIndex, wcCount, slot)))
  })
  const eqPositions = equipmentPositions(wcIds, state.equipment)
  for (const eq of state.equipment) {
    if (eq.unitId) targets.set(eq.unitId, unitOnEquipmentPosition(eqPositions.get(eq.id)!))
  }

  // 2. 새로 투입된 Unit은 자재 창고에서 출발
  for (const unitId of targets.keys()) {
    if (!visuals.has(unitId)) {
      visuals.set(unitId, {
        position: new Vector3(...warehousePosition(wcCount)),
        itemId: state.units[unitId].itemId,
        exit: null,
      })
    }
  }

  // 3. 위치 갱신 및 인스턴스 기록
  const alpha = 1 - Math.exp(-FOLLOW_RATE * delta)
  let index = 0
  for (const [unitId, visual] of visuals) {
    const goal = targets.get(unitId)
    if (goal) {
      target.set(...goal)
    } else {
      // 라인을 떠난 Unit: 양품은 출하장, 불량은 폐기함으로 이동 후 사라진다
      visual.exit ??= state.units[unitId]?.status === 'SCRAPPED' ? 'SCRAP' : 'SHIPPING'
      target.set(...(visual.exit === 'SCRAP' ? scrapPosition() : shippingPosition(wcCount)))
      if (visual.position.distanceTo(target) < ARRIVE_DISTANCE) {
        visuals.delete(unitId)
        continue
      }
    }
    visual.position.lerp(target, alpha)
    if (index >= MAX_UNITS) continue

    matrix.makeTranslation(visual.position)
    mesh.setMatrixAt(index, matrix)
    color.set(visual.exit === 'SCRAP' ? SCRAP_COLOR : (ITEM_COLOR[visual.itemId] ?? DEFAULT_ITEM_COLOR))
    mesh.setColorAt(index, color)
    index++
  }
  mesh.count = index
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
})

onBeforeUnmount(() => {
  geometry.dispose()
  material.dispose()
  mesh.dispose()
})
</script>

<template>
  <primitive :object="mesh" />
</template>
