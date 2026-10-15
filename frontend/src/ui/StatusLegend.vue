<script setup lang="ts">
import { EQUIPMENT_STATUS_STYLE, ITEM_COLOR, SCRAP_COLOR, SENSOR_LEVEL_STYLE, bufferFillColor, heatColor, stockColor } from '@/scene/colors'

const itemLabels: Record<string, string> = { 'MOTOR-A': '표준형 A', 'MOTOR-B': '고급형 B' }
</script>

<template>
  <details class="panel legend">
    <summary>범례</summary>
    <h2>설비 상태 (바닥 띠·경광등)</h2>
    <ul>
      <li
        v-for="(style, status) in EQUIPMENT_STATUS_STYLE"
        :key="status"
      >
        <i :style="{ background: style.color }" />{{ style.label }}
      </li>
    </ul>
    <h2>사람</h2>
    <ul>
      <li><i style="background: #f0883e" />작업자</li>
      <li><i style="background: #e6edf3" />검사원</li>
      <li><i style="background: #1f6feb" />정비사(고장·정비 중)</li>
    </ul>
    <h2>제품</h2>
    <ul>
      <li
        v-for="(color, itemId) in ITEM_COLOR"
        :key="itemId"
      >
        <i :style="{ background: color }" />{{ itemLabels[itemId] ?? itemId }}
      </li>
      <li><i :style="{ background: SCRAP_COLOR }" />불량(폐기)</li>
    </ul>
    <h2>센서 (설비 바닥 링)</h2>
    <ul>
      <li
        v-for="(style, level) in SENSOR_LEVEL_STYLE"
        :key="level"
      >
        <i :style="{ background: style.color }" />{{ style.label }}
      </li>
    </ul>
    <h2>자재 랙</h2>
    <ul>
      <li><i :style="{ background: stockColor(10, 5) }" />정상</li>
      <li><i :style="{ background: stockColor(5, 5) }" />발주점 이하</li>
      <li><i :style="{ background: stockColor(0, 5) }" />결품</li>
    </ul>
    <h2>히트맵 (작업장 가동률)</h2>
    <ul>
      <li><i :style="{ background: heatColor(0) }" />낮음</li>
      <li><i :style="{ background: heatColor(0.5) }" />중간</li>
      <li><i :style="{ background: heatColor(1) }" />높음</li>
    </ul>
    <h2>버퍼 점유율</h2>
    <ul>
      <li><i :style="{ background: bufferFillColor(0) }" />50% 미만</li>
      <li><i :style="{ background: bufferFillColor(0.5) }" />50~90%</li>
      <li><i :style="{ background: bufferFillColor(1) }" />90% 이상</li>
    </ul>
  </details>
</template>
