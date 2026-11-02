<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { useLoop } from '@tresjs/core'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { CONVEYOR_TOP_Y, type Vec3 } from '../layout'
import BoxInstances from './BoxInstances.vue'

/** 벨트 컨베이어 한 구간(x: from → to, z = 0). 벨트 무늬가 계속 흐른다. */
const props = defineProps<{ from: number; to: number }>()

const WIDTH = 0.5
const BELT_SPEED = 0.6
/** 벨트 무늬 한 칸 길이 */
const PATTERN_LENGTH = 0.25
const LEG_SPACING = 1.2

const length = computed(() => props.to - props.from)
const centerX = computed(() => (props.from + props.to) / 2)
const legXs = computed(() => {
  const count = Math.max(2, Math.ceil(length.value / LEG_SPACING) + 1)
  const inset = 0.12
  return Array.from({ length: count }, (_, i) => props.from + inset + ((length.value - 2 * inset) * i) / (count - 1))
})
const LEG_HEIGHT = CONVEYOR_TOP_Y - 0.04
/** 다리는 x마다 벨트 양쪽에 하나씩(InstancedMesh 하나로 그린다) */
const legs = computed(() => legXs.value.flatMap((x): Vec3[] => [-1, 1].map((side) => [x, LEG_HEIGHT / 2, (side * WIDTH) / 2])))

// 어두운 벨트에 옅은 가로줄: 흐르는 방향이 보이도록 한다
const canvas = document.createElement('canvas')
canvas.width = 32
canvas.height = 8
const ctx = canvas.getContext('2d')!
ctx.fillStyle = '#1b2026'
ctx.fillRect(0, 0, 32, 8)
ctx.fillStyle = '#39414b'
ctx.fillRect(0, 0, 6, 8)
const texture = new CanvasTexture(canvas)
texture.wrapS = RepeatWrapping
texture.colorSpace = SRGBColorSpace
texture.repeat.set(length.value / PATTERN_LENGTH, 1)

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }) => {
  texture.offset.x -= (delta * BELT_SPEED) / PATTERN_LENGTH
})

onBeforeUnmount(() => texture.dispose())

const railY = CONVEYOR_TOP_Y + 0.02
const beltY = CONVEYOR_TOP_Y - 0.02
</script>

<template>
  <TresGroup :position="[centerX, 0, 0]">
    <TresMesh :position="[0, beltY, 0]">
      <TresBoxGeometry :args="[length, 0.04, WIDTH - 0.04]" />
      <TresMeshStandardMaterial
        :map="texture"
        :roughness="0.9"
      />
    </TresMesh>
    <TresMesh
      v-for="side in [-1, 1]"
      :key="side"
      :position="[0, railY, (side * WIDTH) / 2]"
    >
      <TresBoxGeometry :args="[length, 0.08, 0.04]" />
      <TresMeshStandardMaterial
        color="#8b949e"
        :metalness="0.7"
        :roughness="0.35"
      />
    </TresMesh>
  </TresGroup>
  <BoxInstances
    :size="[0.04, LEG_HEIGHT, 0.04]"
    :positions="legs"
    color="#484f58"
  />
</template>
