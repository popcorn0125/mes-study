<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDisclosure } from '@/composables/useDisclosure'
import { useNow } from '@/composables/useNow'
import { toAlerts } from '@/dashboard/alerts'
import { useLatestLogs } from '@/dashboard/latestLogs'
import { formatAgo } from '@/dashboard/production'

/**
 * 헤더의 설비 알림: 경고 · 고장 · 통신 끊김 설비 수를 배지로 보이고, 누르면 목록을 연다.
 * 목록 항목을 누르면 설비 관리 화면에서 그 설비를 선택한 상태로 이동한다.
 * 서버 응답이 없을 때는 알림을 세지 않는다(연결 상태가 따로 보인다).
 */
const latest = useLatestLogs()
const now = useNow()
const router = useRouter()

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLElement | null>(null)
const { open, toggle, close } = useDisclosure(root, trigger)

const alerts = computed(() =>
  latest.data.value === undefined || latest.error.value ? [] : toAlerts(latest.data.value, now.value),
)

/** 설비 관리에서 그 설비를 선택해 연다 */
function goTo(equipmentId: string) {
  close()
  void router.push({ name: 'equipment', query: { equipment: equipmentId } })
}
</script>

<template>
  <div
    ref="root"
    class="hdr-menu"
  >
    <button
      ref="trigger"
      type="button"
      class="hdr-icon-btn"
      :class="{ 'hdr-icon-btn--alert': alerts.length > 0 }"
      :aria-expanded="open"
      aria-controls="hdr-alert-list"
      :aria-label="alerts.length > 0 ? `설비 알림 ${alerts.length}건` : '설비 알림 없음'"
      @click="toggle"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
      >
        <path
          d="M12 3a6 6 0 0 0-6 6v3.5L4.5 15v1.5h15V15L18 12.5V9a6 6 0 0 0-6-6Zm-2 15a2 2 0 0 0 4 0"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linejoin="round"
        />
      </svg>
      <span
        v-if="alerts.length > 0"
        class="hdr-badge"
        aria-hidden="true"
      >{{ alerts.length }}</span>
    </button>

    <div
      v-show="open"
      id="hdr-alert-list"
      class="hdr-panel hdr-panel--alerts"
    >
      <p class="hdr-panel__title">
        설비 알림
      </p>
      <p
        v-if="alerts.length === 0"
        class="hdr-panel__empty"
      >
        모든 설비가 정상 가동 중입니다.
      </p>
      <ul v-else>
        <li
          v-for="alert in alerts"
          :key="alert.equipmentId"
        >
          <button
            type="button"
            class="hdr-alert"
            @click="goTo(alert.equipmentId)"
          >
            <span class="hdr-alert__name">{{ alert.name }}</span>
            <span class="hdr-alert__kind">
              <span
                aria-hidden="true"
                :style="{ color: alert.color }"
              >●</span> {{ alert.label }}
            </span>
            <span class="hdr-alert__at">{{ alert.at === undefined ? '–' : formatAgo(alert.at, now) }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
