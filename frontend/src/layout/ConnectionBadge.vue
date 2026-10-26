<script setup lang="ts">
import { computed } from 'vue'
import { useNow } from '@/composables/useNow'
import { useLatestLogs } from '@/dashboard/latestLogs'
import { formatAgo } from '@/dashboard/production'

/**
 * 헤더의 서버 연결 상태. 최신 로그 폴링이 성공하고 있으면 "실시간 연결",
 * 실패하면 "연결 끊김"과 마지막으로 응답받은 시각을 보인다. 색과 글자를 함께 써서 색만으로 읽지 않게 한다.
 */
const latest = useLatestLogs()
const now = useNow()

const state = computed(() => {
  if (latest.loading.value) return { tone: 'pending', label: '연결 중', detail: '' }
  if (latest.error.value) {
    const at = latest.updatedAt.value?.getTime()
    return { tone: 'down', label: '연결 끊김', detail: at ? `마지막 응답 ${formatAgo(at, now.value)}` : '' }
  }
  return { tone: 'up', label: '실시간 연결', detail: '2초마다 갱신' }
})
</script>

<template>
  <span
    class="hdr-conn"
    :class="`hdr-conn--${state.tone}`"
    role="status"
    :title="state.detail"
  >
    <span
      class="hdr-conn__dot"
      aria-hidden="true"
    />
    {{ state.label }}
    <small v-if="state.tone === 'down' && state.detail">{{ state.detail }}</small>
  </span>
</template>
