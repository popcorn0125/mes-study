<script setup lang="ts">
import { computed } from 'vue'
import { EQUIPMENT_STATUS_STYLE } from '@/scene/colors'
import { formatAgo } from './production'
import { isOutOfRange, type EquipmentCard } from './equipment'

/**
 * 설비 한 대의 현재 상태 카드: 상태(색 + 이름) · 온도 · 진동.
 * 누르면 그 설비를 선택해 아래 추이 · 이력을 바꾼다. 수신이 끊기면 상태 대신 "통신 끊김"을 보인다.
 */
const props = defineProps<{
  card: EquipmentCard
  selected: boolean
  /** "n초 전" 계산용 현재 시각(ms) */
  now: number
}>()
defineEmits<{ select: [equipmentId: string] }>()

const status = computed(() => {
  const { log, disconnected } = props.card
  if (!log) return { color: '#8b949e', label: '수신 없음' }
  if (disconnected) return { color: '#8b949e', label: '통신 끊김' }
  return EQUIPMENT_STATUS_STYLE[log.status]
})

const temperatureOut = computed(() => isOutOfRange(props.card.log?.temperature ?? null, props.card.equipment.temperature))
const vibrationOut = computed(() => isOutOfRange(props.card.log?.vibration ?? null, props.card.equipment.vibration))

/** 값이 없으면 "–", 있으면 소수 1자리 */
const fixed1 = (value: number | null | undefined) => (value === null || value === undefined ? '–' : value.toFixed(1))
</script>

<template>
  <button
    type="button"
    class="eq-card"
    :class="{ 'eq-card--selected': selected, 'eq-card--disconnected': card.disconnected }"
    :aria-pressed="selected"
    @click="$emit('select', card.equipment.id)"
  >
    <span class="eq-card__name">{{ card.equipment.name }}</span>
    <span class="eq-card__status">
      <span
        aria-hidden="true"
        :style="{ color: status.color }"
      >●</span> {{ status.label }}
      <small v-if="card.log && card.disconnected">{{ formatAgo(Date.parse(card.log.recordedAt), now) }}</small>
    </span>
    <span class="eq-card__metrics">
      <span :class="{ 'eq-card__out': temperatureOut }">
        {{ fixed1(card.log?.temperature) }}<small>°C</small>
      </span>
      <span :class="{ 'eq-card__out': vibrationOut }">
        {{ fixed1(card.log?.vibration) }}<small>mm/s</small>
      </span>
    </span>
    <span class="eq-card__range">
      정상 {{ card.equipment.temperature[0] }}~{{ card.equipment.temperature[1] }}°C ·
      {{ card.equipment.vibration[0] }}~{{ card.equipment.vibration[1] }}mm/s
    </span>
  </button>
</template>
