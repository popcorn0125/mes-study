<script setup lang="ts">
import { onMounted } from 'vue'
import { useSimStore } from '@/stores/sim'
import FactoryScene from '@/scene/FactoryScene.vue'

/** 자동 시뮬레이션: 조작 없이 자유 체험 공장을 계속 돌리며 3D로 보여 준다(대시보드가 보는 데이터를 만든다) */
const sim = useSimStore()

onMounted(() => sim.play())
</script>

<template>
  <FactoryScene />
</template>
