<script setup lang="ts">
/**
 * KPI 카드: 큰 숫자 + 기준값·보조 설명.
 * tone은 기준 대비 상태(좋음/주의/나쁨)이고, 색과 함께 글자로도 알려준다(색만으로 구분하지 않도록).
 */
export type KpiTone = 'good' | 'warn' | 'bad' | 'neutral'

defineProps<{
  label: string
  value: string
  unit?: string
  sub?: string
  tone?: KpiTone
  /** 지표 정의(마우스를 올리면 보인다) */
  hint?: string
}>()

const TONE_LABEL: Record<KpiTone, string> = { good: '정상', warn: '주의', bad: '미달', neutral: '' }
</script>

<template>
  <article
    class="card kpi-card"
    :class="`kpi-card--${tone ?? 'neutral'}`"
    :title="hint"
  >
    <header class="kpi-card__label">
      {{ label }}
      <span
        v-if="tone && tone !== 'neutral'"
        class="kpi-card__tone"
      >{{ TONE_LABEL[tone] }}</span>
    </header>
    <p class="kpi-card__value">
      {{ value }}<small v-if="unit">{{ unit }}</small>
    </p>
    <p
      v-if="sub"
      class="kpi-card__sub"
    >
      {{ sub }}
    </p>
  </article>
</template>
