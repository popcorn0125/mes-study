<script setup lang="ts">
/**
 * 조회 API 연결 상태 안내. 요청이 실패하면 띄우고, 다음 폴링이 성공하면 저절로 사라진다.
 * 마지막으로 받은 데이터는 화면에 그대로 두므로 "언제 값인지"를 같이 알려 준다.
 */
defineProps<{
  /** 마지막 요청의 오류(없으면 숨김) */
  error: unknown
  /** 마지막으로 성공한 시각 */
  updatedAt?: Date
}>()
</script>

<template>
  <p
    v-if="error"
    class="dash-notice"
    role="alert"
  >
    <strong>서버에 연결할 수 없습니다.</strong>
    <span v-if="updatedAt">
      {{ updatedAt.toLocaleTimeString('ko-KR') }}에 받은 값을 보여 주고 있습니다. 2초마다 다시 연결합니다.
    </span>
    <span v-else>백엔드(localhost:8080)가 켜져 있는지 확인해 주세요. 2초마다 다시 연결합니다.</span>
  </p>
</template>
