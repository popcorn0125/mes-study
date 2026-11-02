<script setup lang="ts">
import { shallowRef, watchEffect } from 'vue'
import { Matrix4, type InstancedMesh } from 'three'
import type { Vec3 } from '../layout'

/**
 * 크기 · 재질이 같은 상자 여러 개를 InstancedMesh 하나로 그린다(상자마다 메시를 두면 그만큼 그리기 호출이 는다).
 * capacity만큼 칸을 만들어 두고, positions가 바뀌면 칸 위치와 그릴 개수만 고친다(메시를 다시 만들지 않는다).
 */
const props = withDefaults(defineProps<{
  size: Vec3
  positions: readonly Vec3[]
  color: string
  /** 최대 개수. 없으면 처음 positions 길이 */
  capacity?: number
  roughness?: number
  metalness?: number
}>(), { capacity: undefined, roughness: 1, metalness: 0 })

const capacity = props.capacity ?? props.positions.length
const mesh = shallowRef<InstancedMesh>()
const matrix = new Matrix4()

watchEffect(() => {
  const m = mesh.value
  if (!m) return
  const count = Math.min(props.positions.length, capacity)
  for (let i = 0; i < count; i++) {
    const [x, y, z] = props.positions[i]
    m.setMatrixAt(i, matrix.makeTranslation(x, y, z))
  }
  m.count = count
  m.instanceMatrix.needsUpdate = true
  // 화면 밖 판정(frustum culling)이 바뀐 위치를 쓰도록 경계 구를 다시 잰다
  m.computeBoundingSphere()
})
</script>

<template>
  <TresInstancedMesh
    ref="mesh"
    :args="[undefined, undefined, capacity]"
  >
    <TresBoxGeometry :args="size" />
    <TresMeshStandardMaterial
      :color="color"
      :roughness="roughness"
      :metalness="metalness"
    />
  </TresInstancedMesh>
</template>
