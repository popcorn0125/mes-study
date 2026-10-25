<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { routes } from '@/router'

/** 관리자 모드 레이아웃: 왼쪽 사이드바(MES 기능 메뉴) + 상단 헤더(페이지 제목). */
const route = useRoute()

const menu = routes.filter((r) => r.name && !r.meta?.fullscreen)
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
    </header>

    <main class="dash-main">
      <slot />
    </main>
  </div>
</template>
