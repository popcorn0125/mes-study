<script setup lang="ts">
import type { EquipmentOee } from '@/api/oee'
import { formatDuration } from './equipment'
import { biggestLoss, formatRatio } from './oee'

/**
 * 설비별 OEE와 가동률 · 성능 · 품질 막대, 가장 큰 손실.
 * 막대 옆에 항상 값을 글자로 붙여 막대 길이만으로 읽지 않게 한다.
 */
defineProps<{ equipment: readonly EquipmentOee[] }>()

const FACTORS = [
  { key: 'availability', label: '가동률' },
  { key: 'performance', label: '성능' },
  { key: 'quality', label: '품질' },
] as const

const width = (ratio: number | null) => `${Math.round((ratio ?? 0) * 100)}%`
</script>

<template>
  <div class="wo-table-wrap">
    <table class="dash-table oee-table">
      <thead>
        <tr>
          <th scope="col">
            설비
          </th>
          <th scope="col">
            OEE
          </th>
          <th
            v-for="factor in FACTORS"
            :key="factor.key"
            scope="col"
          >
            {{ factor.label }}
          </th>
          <th scope="col">
            가장 큰 손실
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="eq in equipment"
          :key="eq.equipmentId"
        >
          <th scope="row">
            {{ eq.equipmentName }}
          </th>
          <td class="oee-table__oee">
            {{ formatRatio(eq.oee) }}
          </td>
          <td
            v-for="factor in FACTORS"
            :key="factor.key"
          >
            <span class="oee-factor">
              <span
                class="wo-bar oee-bar"
                aria-hidden="true"
              ><span :style="{ width: width(eq[factor.key]) }" /></span>
              {{ formatRatio(eq[factor.key]) }}
            </span>
          </td>
          <td class="oee-table__loss">
            <template v-if="biggestLoss(eq)">
              {{ biggestLoss(eq)!.label }} {{ formatDuration(biggestLoss(eq)!.seconds) }}
            </template>
            <template v-else>
              –
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <p class="oee-help">
    가동률 = 가동 ÷ 계획(작업지시가 있던 시간) · 성능 = 기준 택트 × 생산 수 ÷ 가동 · 품질 = 양품 ÷ 생산 수.
    대기는 앞 공정을 기다린 시간, 불량 손실은 불량을 만드느라 쓴 기준 택트 시간입니다.
  </p>
</template>
