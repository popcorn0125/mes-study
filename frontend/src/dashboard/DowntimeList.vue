<script setup lang="ts">
import { computed, reactive } from 'vue'
import { errorMessage } from '@/api/client'
import { saveDowntimeReason, type Downtime, type DowntimeReason } from '@/api/downtime'
import { groupReasons } from './downtime'
import { formatClock, formatDuration } from './equipment'

/**
 * 정지 목록과 사유 입력. 사유 칸은 지금 사유가 고른 상태인 선택 상자라, 사유 없는 정지는 넣고 자동 사유는 고칠 수 있다.
 * 고른 값은 정지 id마다 따로 들고 있어 2초마다 목록을 다시 읽어도 사라지지 않는다.
 */
const props = defineProps<{
  downtimes: readonly Downtime[]
  reasons: readonly DowntimeReason[]
  /** 입력자 이름(로그인 사용자). 없으면 저장할 수 없다 */
  enteredBy: string | undefined
}>()
const emit = defineEmits<{ saved: [downtime: Downtime] }>()

const groups = computed(() => groupReasons(props.reasons))
const drafts = reactive<Record<number, string>>({})
const errors = reactive<Record<number, string>>({})
const saving = reactive<Record<number, boolean>>({})

const draftOf = (d: Downtime) => drafts[d.id] ?? d.reasonCode ?? ''
const changed = (d: Downtime) => draftOf(d) !== '' && draftOf(d) !== d.reasonCode

async function save(d: Downtime) {
  if (!props.enteredBy || !changed(d)) return
  saving[d.id] = true
  delete errors[d.id]
  try {
    const saved = await saveDowntimeReason(d.id, draftOf(d), props.enteredBy)
    delete drafts[d.id]
    emit('saved', saved)
  } catch (error) {
    errors[d.id] = errorMessage(error, '사유를 저장하지 못했습니다')
  } finally {
    delete saving[d.id]
  }
}

function sourceText(d: Downtime): string {
  if (d.reasonSource === 'AUTO') return '자동(알람)'
  if (d.reasonSource === 'MANUAL') return `${d.reasonBy ?? '작업자'} 입력 ${d.reasonAt ? formatClock(d.reasonAt) : ''}`.trim()
  return '사유 미입력'
}
</script>

<template>
  <div class="wo-table-wrap downtime-list">
    <table class="dash-table">
      <thead>
        <tr>
          <th scope="col">
            설비
          </th>
          <th scope="col">
            시작
          </th>
          <th scope="col">
            시간
          </th>
          <th scope="col">
            알람
          </th>
          <th scope="col">
            사유
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="d in downtimes"
          :key="d.id"
          :class="{ 'downtime-row--pending': !d.reasonCode }"
        >
          <th scope="row">
            {{ d.equipmentName }}
          </th>
          <td>{{ formatClock(d.startedAt) }}</td>
          <td>
            {{ formatDuration(d.durationSec) }}
            <span
              v-if="d.ongoing"
              class="downtime-chip downtime-chip--live"
            >진행 중</span>
          </td>
          <td>{{ d.alarmName ?? '없음' }}</td>
          <td>
            <div class="downtime-reason">
              <select
                :value="draftOf(d)"
                :aria-label="`${d.equipmentName} ${formatClock(d.startedAt)} 정지 사유`"
                :disabled="saving[d.id]"
                @change="drafts[d.id] = ($event.target as HTMLSelectElement).value"
              >
                <option
                  value=""
                  disabled
                >
                  사유 선택
                </option>
                <optgroup
                  v-for="group in groups"
                  :key="group.category"
                  :label="group.category"
                >
                  <option
                    v-for="reason in group.reasons"
                    :key="reason.reasonCode"
                    :value="reason.reasonCode"
                  >
                    {{ reason.reasonName }}
                  </option>
                </optgroup>
              </select>
              <button
                type="button"
                class="btn btn--small"
                :class="{ 'btn--primary': changed(d) }"
                :disabled="!changed(d) || !enteredBy || saving[d.id]"
                @click="save(d)"
              >
                {{ saving[d.id] ? '저장 중…' : '저장' }}
              </button>
            </div>
            <small
              class="downtime-source"
              :class="{ 'downtime-source--pending': !d.reasonCode }"
            >{{ sourceText(d) }}</small>
            <small
              v-if="errors[d.id]"
              class="downtime-error"
              role="alert"
            >{{ errors[d.id] }}</small>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
