<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useLoop } from '@tresjs/core'
import type { Group, MeshStandardMaterial } from 'three'
import { useSimStore } from '@/stores/sim'
import { AISLE_Z } from '../layout'

/**
 * 자재 운반 AGV: 앞쪽 통로를 따라 자재 창고에서 출발해 자재를 쓰는 공정 앞에 차례로 들렀다가 돌아온다.
 * 분위기 연출용이며 엔진의 자재 재고와는 연결되어 있지 않다. 시뮬레이션이 멈추면 AGV도 멈춘다.
 */
const props = defineProps<{ startX: number; stopXs: number[] }>()

const SPEED = 1.6
const DWELL_SECONDS = 2.5

/** 구간 목록: 출발 x → 도착 x, 도착 후 정차 시간 */
const legs = computed(() => {
  const stops = [...props.stopXs].sort((a, b) => a - b)
  const points = [props.startX, ...stops, props.startX]
  return points.slice(1).map((to, i) => ({ from: points[i], to, dwell: DWELL_SECONDS }))
})
const cycle = computed(() => legs.value.reduce((sum, leg) => sum + Math.abs(leg.to - leg.from) / SPEED + leg.dwell, 0))

const root = shallowRef<Group>()
const beacon = shallowRef<MeshStandardMaterial>()
let t = 0

const sim = useSimStore()
const { onBeforeRender } = useLoop()
onBeforeRender(({ delta, elapsed }) => {
  if (!root.value) return
  if (sim.playing) t = (t + delta) % cycle.value
  let rest = t
  for (const leg of legs.value) {
    const travel = Math.abs(leg.to - leg.from) / SPEED
    if (rest < travel) {
      root.value.position.x = leg.from + Math.sign(leg.to - leg.from) * rest * SPEED
      root.value.rotation.y = leg.to > leg.from ? 0 : Math.PI
      break
    }
    rest -= travel
    if (rest < leg.dwell) {
      root.value.position.x = leg.to
      break
    }
    rest -= leg.dwell
  }
  // 움직이는 동안 경광등이 깜박인다
  if (beacon.value) beacon.value.emissiveIntensity = sim.playing ? 0.6 + 1.4 * Math.abs(Math.sin(elapsed * 6)) : 0.2
})
</script>

<template>
  <TresGroup
    ref="root"
    :position="[startX, 0, AISLE_Z]"
  >
    <TresMesh :position="[0, 0.16, 0]">
      <TresBoxGeometry :args="[0.9, 0.22, 0.6]" />
      <TresMeshStandardMaterial
        color="#e3812b"
        :roughness="0.5"
      />
    </TresMesh>
    <TresMesh :position="[0, 0.06, 0]">
      <TresBoxGeometry :args="[0.94, 0.06, 0.64]" />
      <TresMeshStandardMaterial color="#21262d" />
    </TresMesh>
    <!-- 앞쪽 범퍼 센서 -->
    <TresMesh :position="[0.46, 0.16, 0]">
      <TresBoxGeometry :args="[0.03, 0.06, 0.4]" />
      <TresMeshStandardMaterial
        color="#111"
        emissive="#58a6ff"
        :emissive-intensity="0.5"
      />
    </TresMesh>
    <TresMesh :position="[0.3, 0.34, 0.22]">
      <TresCylinderGeometry :args="[0.04, 0.04, 0.06, 12]" />
      <TresMeshStandardMaterial
        ref="beacon"
        color="#d29922"
        emissive="#f0b72f"
        :emissive-intensity="0.2"
      />
    </TresMesh>
    <!-- 적재한 자재 상자 -->
    <TresMesh
      v-for="(box, i) in [[-0.2, -0.12], [-0.2, 0.14], [0.08, -0.12], [0.08, 0.14]]"
      :key="i"
      :position="[box[0], 0.39, box[1]]"
    >
      <TresBoxGeometry :args="[0.26, 0.24, 0.24]" />
      <TresMeshStandardMaterial
        :color="i % 2 ? '#2f81f7' : '#6e7681'"
        :roughness="0.8"
      />
    </TresMesh>
  </TresGroup>
</template>
