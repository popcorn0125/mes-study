<script setup lang="ts">
/** 아직 만들지 않은 페이지: 어떤 MES 기능을 다루고 어떤 개념을 익히는지 보여준다 */
defineProps<{
  mesFunction: string
  concepts: string[]
}>()
</script>

<template>
  <section class="card placeholder">
    <p class="placeholder__eyebrow">
      MES 기능 · {{ mesFunction }}
    </p>
    <p>이 페이지는 아직 준비 중입니다.</p>
    <h2>이 페이지에서 익힐 개념</h2>
    <ul class="placeholder__concepts">
      <li
        v-for="concept in concepts"
        :key="concept"
      >
        {{ concept }}
      </li>
    </ul>
  </section>
</template>
