<script setup lang="ts">
import { provide } from 'vue'
import { SENSOR_LOGS, useSensorProducer } from '@/producer/useSensorProducer'
import FactoryScene from '@/scene/FactoryScene.vue'

/**
 * 자동 시뮬레이션: 더미 센서 데이터 발생기(Producer).
 * 1초마다 설비별 난수 데이터를 만들어 서버로 보내고, 3D 장면은 그 데이터를 그대로 보여 준다.
 */
provide(SENSOR_LOGS, useSensorProducer())
</script>

<template>
  <FactoryScene />
</template>
