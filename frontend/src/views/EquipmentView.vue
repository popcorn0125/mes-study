<script setup lang="ts">
import { ref } from 'vue'
import { EQUIPMENT_CONCEPTS } from '@/concepts/equipment'
import ConceptPanel from '@/dashboard/ConceptPanel.vue'
import DowntimeLog from '@/dashboard/equipment/DowntimeLog.vue'
import DowntimeParetoChart from '@/dashboard/equipment/DowntimeParetoChart.vue'
import EquipmentStatusBoard from '@/dashboard/equipment/EquipmentStatusBoard.vue'
import EquipmentTimeChart from '@/dashboard/equipment/EquipmentTimeChart.vue'
import OeeBreakdownChart from '@/dashboard/equipment/OeeBreakdownChart.vue'
import ReliabilityTable from '@/dashboard/equipment/ReliabilityTable.vue'
import SensorTrendChart from '@/dashboard/equipment/SensorTrendChart.vue'
import { useSimStore } from '@/stores/sim'

/** 설비 관리: 어느 설비가 왜 얼마나 멈췄나 / 제 능력을 내나 / 다음에 고장 날 설비는 */
const sim = useSimStore()

// 처음에는 고장이 가장 먼저 나는 첫 공정 설비(CNC)를 보여 준다
const selectedId = ref(sim.state.equipment[0]?.id ?? '')
</script>

<template>
  <div class="dash-page">
    <EquipmentStatusBoard
      :selected-id="selectedId"
      @select="selectedId = $event"
    />
    <div class="dash-row">
      <OeeBreakdownChart />
      <DowntimeParetoChart />
    </div>
    <div class="dash-row">
      <EquipmentTimeChart />
      <ReliabilityTable
        :selected-id="selectedId"
        @select="selectedId = $event"
      />
    </div>
    <div class="dash-row">
      <SensorTrendChart :equipment-id="selectedId" />
      <DowntimeLog :selected-id="selectedId" />
    </div>
    <ConceptPanel :concepts="EQUIPMENT_CONCEPTS" />
  </div>
</template>
