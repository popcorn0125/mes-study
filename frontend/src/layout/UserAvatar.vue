<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { User } from '@/auth/accounts'

/**
 * 원형 프로필. 사진(avatarUrl)이 있으면 사진을, 없거나 불러오지 못하면 이름 첫 글자(성)를 보인다.
 * 바로 옆에 이름 글자가 있으므로 장식으로 두고 화면 낭독기는 읽지 않게 한다.
 */
const props = withDefaults(defineProps<{ user: User; size?: number }>(), { size: 32 })

/** 이니셜 배경색: 흰 글자와 대비가 충분한 색 중에서 아이디로 하나를 골라 늘 같은 색이 나오게 한다 */
const COLORS = ['#1f6feb', '#8250df', '#bf3989', '#1a7f37', '#bc4c00', '#0969da']

/** 아이디 글자 코드 합으로 색 순번을 정한다 */
function colorOf(username: string): string {
  let sum = 0
  for (const ch of username) sum += ch.codePointAt(0) ?? 0
  return COLORS[sum % COLORS.length]
}

const imageFailed = ref(false)
watch(() => props.user.avatarUrl, () => (imageFailed.value = false))

const showImage = computed(() => Boolean(props.user.avatarUrl) && !imageFailed.value)
const initial = computed(() => [...props.user.name.trim()][0] ?? '?')
</script>

<template>
  <span
    class="avatar"
    aria-hidden="true"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.45)}px`, background: showImage ? undefined : colorOf(user.username) }"
  >
    <img
      v-if="showImage"
      :src="user.avatarUrl"
      alt=""
      @error="imageFailed = true"
    >
    <template v-else>{{ initial }}</template>
  </span>
</template>
