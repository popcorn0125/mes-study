<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { provideLatestLogs } from '@/dashboard/latestLogs'
import { routes } from '@/router'
import AlertMenu from './AlertMenu.vue'
import ConnectionBadge from './ConnectionBadge.vue'
import UserMenu from './UserMenu.vue'

/**
 * 관리자 모드 레이아웃: 왼쪽 사이드바(MES 기능 메뉴) + 상단 헤더(페이지 제목 · 서버 연결 · 설비 알림 · 사용자).
 * 설비별 최신 로그는 여기서 한 번만 2초 폴링해 헤더와 페이지가 나눠 쓴다.
 */
const route = useRoute()
provideLatestLogs()

const menu = routes.filter((r) => r.name && !r.meta?.fullscreen && !r.meta?.hidden)
const simulator = routes.find((r) => r.name === 'simulator')!
</script>

<template>
  <div class="dash">
    <aside class="dash-sidebar">
      <div class="dash-brand">
        <strong>MES Dashboard</strong>
        <span>BLDC 모터 조립 라인</span>
      </div>
      <nav
        class="dash-nav"
        aria-label="주 메뉴"
      >
        <RouterLink
          v-for="item in menu"
          :key="String(item.name)"
          :to="item.path"
          class="dash-nav__link"
          active-class=""
          exact-active-class="dash-nav__link--active"
        >
          <span aria-hidden="true">{{ item.meta!.icon }}</span>
          {{ item.meta!.title }}
        </RouterLink>
      </nav>
      <RouterLink
        :to="simulator.path"
        class="dash-nav__link dash-nav__link--simulator"
      >
        <span aria-hidden="true">{{ simulator.meta!.icon }}</span>
        {{ simulator.meta!.title }}
      </RouterLink>
    </aside>

    <header class="dash-header">
      <h1>{{ route.meta.title }}</h1>
      <div class="dash-header__tools">
        <ConnectionBadge />
        <span
          class="dash-header__divider"
          aria-hidden="true"
        />
        <AlertMenu />
        <span
          class="dash-header__divider"
          aria-hidden="true"
        />
        <UserMenu />
      </div>
    </header>

    <main class="dash-main">
      <slot />
    </main>
  </div>
</template>
