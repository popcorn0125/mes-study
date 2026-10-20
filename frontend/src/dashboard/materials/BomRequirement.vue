<script setup lang="ts">
import { computed } from 'vue'
import { bomTree, materialRequirements } from '@/domain/mrp'
import { useSimStore } from '@/stores/sim'
import { createNameLookup } from '@/ui/format'

/**
 * BOM 소요량: 왼쪽은 품목별 BOM(정전개), 오른쪽은 끝나지 않은 작업지시를 기준으로 계산한 자재별 소요량(MRP 기초).
 * 순소요 = 총소요 + 안전재고 − 현재고 − 입고 예정. 양수면 지금까지 발주한 것만으로는 남은 생산을 다 못 한다.
 */
const emit = defineEmits<{ select: [id: string] }>()
const sim = useSimStore()

const view = computed(() => {
  const names = createNameLookup(sim.master)
  const units = new Map(sim.master.materials.map((m) => [m.id, m.unit]))
  return {
    tree: bomTree(sim.master).map((item) => ({
      id: item.itemId,
      name: names.item(item.itemId),
      workCenters: item.workCenters.map((wc) => ({
        id: wc.workCenterId,
        name: names.workCenter(wc.workCenterId),
        lines: wc.lines.map((l) => ({ id: l.materialId, text: `${names.material(l.materialId)} × ${l.qtyPer}` })),
      })),
    })),
    rows: materialRequirements(sim.state, sim.master).map((r) => ({
      ...r,
      name: names.material(r.materialId),
      unit: units.get(r.materialId) ?? '',
      breakdown: r.byItem.map((x) => `${names.item(x.itemId)} ${x.qty}`).join(' + ') || '남은 생산 없음',
    })),
  }
})
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      BOM 소요량 <small class="muted">끝나지 않은 작업지시 기준</small>
    </h2>
    <div class="mat-bom">
      <div
        class="mat-bom__tree"
        aria-label="BOM 정전개"
      >
        <ul
          v-for="item in view.tree"
          :key="item.id"
          class="mat-tree"
        >
          <li>
            <strong>{{ item.name }}</strong> <span class="muted">1대</span>
            <ul>
              <li
                v-for="wc in item.workCenters"
                :key="wc.id"
              >
                <span class="muted">{{ wc.name }}:</span>
                <button
                  v-for="l in wc.lines"
                  :key="l.id"
                  class="link-btn q-chip"
                  :title="`${l.text} — 재고 현황에서 보기`"
                  @click="emit('select', l.id)"
                >
                  {{ l.text }}
                </button>
              </li>
            </ul>
          </li>
        </ul>
      </div>
      <div class="wo-table-wrap">
        <table class="dash-table q-yield">
          <thead>
            <tr>
              <th scope="col">
                자재
              </th>
              <th
                scope="col"
                title="남은 생산 수량 × BOM 수량(마우스를 올리면 품목별)"
              >
                총소요
              </th>
              <th scope="col">
                현재고
              </th>
              <th scope="col">
                입고 예정
              </th>
              <th scope="col">
                안전재고
              </th>
              <th
                scope="col"
                title="총소요 + 안전재고 − 현재고 − 입고 예정"
              >
                순소요
              </th>
              <th scope="col">
                판정
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in view.rows"
              :key="r.materialId"
            >
              <th scope="row">
                {{ r.name }}
              </th>
              <td :title="r.breakdown">
                {{ r.gross }}
              </td>
              <td>{{ r.onHand }}</td>
              <td>{{ r.onOrder || '—' }}</td>
              <td>{{ r.safetyStock }}</td>
              <td :class="{ 'text-warn': r.net > 0 }">
                {{ r.net > 0 ? `+${r.net}` : r.net }}
              </td>
              <td :class="r.net > 0 ? 'text-warn' : 'text-ok'">
                {{ r.net > 0 ? `${r.net}${r.unit} 더 확보 필요` : '충분' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <p class="dash-panel__note muted">
      교대 시작에는 8시간치 소요가 한꺼번에 잡혀 순소요가 크게 나옵니다. 이 공장은 발주점 방식으로 조금씩 나눠 들여오므로, 순소요는 "남은 생산을 마치려면 앞으로 더 들어와야 하는 양"으로 읽으면 됩니다.
    </p>
  </section>
</template>
