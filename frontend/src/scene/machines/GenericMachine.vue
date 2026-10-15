<script setup lang="ts">
import MachineBase from './MachineBase.vue'

/** 전용 모델이 없는 작업장의 설비: 캐비닛과 작업대만 그린다. */
defineProps<{ equipmentId: string }>()
</script>

<template>
  <MachineBase />
</template>
