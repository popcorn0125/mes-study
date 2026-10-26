<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DEMO_ACCOUNTS } from '@/auth/accounts'
import { login } from '@/auth/session'
import { safeRedirect } from '@/auth/guard'

/** 로그인 화면: 데모 계정으로 로그인하고, 로그인 전에 열려던 주소로 돌아간다 */
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const failed = ref(false)

/** 아이디 · 비밀번호를 확인하고 맞으면 원래 주소로 이동한다(뒤로 가기로 로그인 화면에 돌아오지 않게 replace) */
function submit() {
  failed.value = !login(username.value, password.value)
  if (!failed.value) void router.replace(safeRedirect(route.query.redirect))
}

/** 안내된 데모 계정을 눌러 입력란을 채운다 */
function fill(account: { username: string; password: string }) {
  username.value = account.username
  password.value = account.password
  failed.value = false
}
</script>

<template>
  <main class="login">
    <form
      class="login__card"
      novalidate
      @submit.prevent="submit"
    >
      <div class="login__brand">
        <strong>MES Dashboard</strong>
        <span>BLDC 모터 조립 라인</span>
      </div>

      <label class="login__field">
        <span>아이디</span>
        <input
          v-model="username"
          name="username"
          autocomplete="username"
          required
          autofocus
        >
      </label>
      <label class="login__field">
        <span>비밀번호</span>
        <input
          v-model="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
        >
      </label>

      <p
        v-if="failed"
        class="login__error"
        role="alert"
      >
        아이디 또는 비밀번호가 맞지 않습니다.
      </p>

      <button
        type="submit"
        class="login__submit"
      >
        로그인
      </button>

      <section
        class="login__demo"
        aria-label="데모 계정"
      >
        <p>데모 계정(누르면 입력됩니다). 화면 흐름 연습용이라 서버 보안은 없습니다.</p>
        <ul>
          <li
            v-for="account in DEMO_ACCOUNTS"
            :key="account.username"
          >
            <button
              type="button"
              @click="fill(account)"
            >
              <span class="login__demo-cred"><strong>{{ account.username }}</strong> / {{ account.password }}</span>
              <span>{{ account.name }} · {{ account.role }}</span>
            </button>
          </li>
        </ul>
      </section>
    </form>
  </main>
</template>
