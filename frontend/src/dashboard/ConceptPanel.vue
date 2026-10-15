<script setup lang="ts">
import type { Concept } from '@/concepts/types'

/** 개념 설명: 페이지에서 쓰는 MES·제조 개념을 접었다 펼 수 있게 보여준다 */
defineProps<{
  concepts: Concept[]
}>()
</script>

<template>
  <section class="card dash-panel">
    <h2 class="dash-panel__title">
      개념 설명
    </h2>
    <details
      v-for="c in concepts"
      :key="c.term"
      class="concept"
    >
      <summary>{{ c.term }}</summary>
      <p
        v-for="(paragraph, i) in c.body"
        :key="i"
      >
        {{ paragraph }}
      </p>
    </details>
  </section>
</template>
