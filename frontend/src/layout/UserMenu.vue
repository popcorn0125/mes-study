<script setup lang="ts">
import { ref } from 'vue'
import { currentUser, logout } from '@/auth/session'
import { useDisclosure } from '@/composables/useDisclosure'
import UserAvatar from './UserAvatar.vue'

/** 헤더의 사용자 메뉴: 원형 프로필 · 이름 · 역할. 누르면 로그아웃 메뉴를 연다 */
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLElement | null>(null)
const { open, toggle, close } = useDisclosure(root, trigger)

/**
 * 로그아웃한다. 로그인 화면 이동은 router.ts가 로그인 상태 변화를 보고 처리한다
 * (?redirect=지금 주소 → 다시 로그인하면 보던 화면으로 돌아온다. 뒤로 가기로 돌아가도 로그인 검사에 막힌다).
 */
function signOut() {
  close()
  logout()
}
</script>

<template>
  <div
    v-if="currentUser"
    ref="root"
    class="hdr-menu"
  >
    <button
      ref="trigger"
      type="button"
      class="hdr-user"
      :aria-expanded="open"
      aria-controls="hdr-user-menu"
      @click="toggle"
    >
      <UserAvatar :user="currentUser" />
      <span class="hdr-user__text">
        <strong>{{ currentUser.name }}</strong>
        <small>{{ currentUser.role }}</small>
      </span>
      <svg
        viewBox="0 0 12 12"
        width="12"
        height="12"
        aria-hidden="true"
      >
        <path
          d="M3 4.5 6 7.5 9 4.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        />
      </svg>
    </button>

    <div
      v-show="open"
      id="hdr-user-menu"
      class="hdr-panel hdr-panel--user"
    >
      <div class="hdr-panel__profile">
        <UserAvatar
          :user="currentUser"
          :size="40"
        />
        <span>
          <strong>{{ currentUser.name }}</strong>
          <small>{{ currentUser.username }} · {{ currentUser.role }}</small>
        </span>
      </div>
      <button
        type="button"
        class="hdr-panel__action"
        @click="signOut"
      >
        로그아웃
      </button>
    </div>
  </div>
</template>
