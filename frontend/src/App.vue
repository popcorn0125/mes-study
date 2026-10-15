<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useScenarioStore } from './stores/scenario'
import { useSelectionStore } from './stores/selection'
import FactoryScene from './scene/FactoryScene.vue'
import DetailPanel from './ui/DetailPanel.vue'
import EventLog from './ui/EventLog.vue'
import KpiBar from './ui/KpiBar.vue'
import SimControls from './ui/SimControls.vue'
import StatusLegend from './ui/StatusLegend.vue'
import WorkOrderPanel from './ui/WorkOrderPanel.vue'
import ResultDialog from './ui/scenario/ResultDialog.vue'
import ScenarioBar from './ui/scenario/ScenarioBar.vue'
import ScenarioBriefing from './ui/scenario/ScenarioBriefing.vue'
import ScenarioLanding from './ui/scenario/ScenarioLanding.vue'

const selection = useSelectionStore()
const scenario = useScenarioStore()

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && scenario.phase === 'running') selection.clear()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <FactoryScene />
  <template v-if="scenario.phase !== 'landing'">
    <ScenarioBar />
    <KpiBar />
    <WorkOrderPanel />
    <EventLog />
    <DetailPanel />
    <StatusLegend />
    <SimControls />
  </template>
  <ScenarioLanding v-if="scenario.phase === 'landing'" />
  <ScenarioBriefing v-else-if="scenario.phase === 'briefing'" />
  <ResultDialog v-else-if="scenario.phase === 'result'" />
</template>
