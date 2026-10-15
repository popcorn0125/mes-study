<script setup lang="ts">
import { useSelectionStore } from '@/stores/selection'
import EquipmentDetail from './detail/EquipmentDetail.vue'
import MaterialDetail from './detail/MaterialDetail.vue'
import UnitDetail from './detail/UnitDetail.vue'
import WorkCenterDetail from './detail/WorkCenterDetail.vue'
import WorkOrderDetail from './detail/WorkOrderDetail.vue'

const selection = useSelectionStore()
</script>

<template>
  <aside
    v-if="selection.selected"
    class="panel side-panel detail-panel"
    aria-label="상세 정보"
  >
    <button
      class="btn btn--icon detail-close"
      aria-label="상세 패널 닫기"
      @click="selection.clear()"
    >
      ✕
    </button>
    <EquipmentDetail
      v-if="selection.selected.kind === 'equipment'"
      :id="selection.selected.id"
    />
    <WorkCenterDetail
      v-else-if="selection.selected.kind === 'workCenter'"
      :id="selection.selected.id"
    />
    <UnitDetail
      v-else-if="selection.selected.kind === 'unit'"
      :id="selection.selected.id"
    />
    <WorkOrderDetail
      v-else-if="selection.selected.kind === 'workOrder'"
      :id="selection.selected.id"
    />
    <MaterialDetail
      v-else
      :id="selection.selected.id"
    />
  </aside>
</template>
