<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { routes } from '@/router'
import { SPEED_OPTIONS, formatSimTime } from '@/sim/clock'
import { useSimStore } from '@/stores/sim'

/**
 * 관리자 모드 레이아웃: 왼쪽 사이드바(MES 기능 메뉴) + 상단 헤더(페이지 제목, 시뮬 시각·재생·배속).
 * 모든 페이지가 같은 시뮬 엔진을 보므로 재생 조작은 헤더 한 곳에 둔다.
 */
const route = useRoute()
const sim = useSimStore()

const menu = routes.filter((r) => r.name && !r.meta?.fullscreen)
const simulator = routes.find((r) => r.name === 'simulator')!
const clock = computed(() => formatSimTime(sim.state.time))

onMounted(() => sim.play())
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
      <div
        class="dash-header__sim"
        role="toolbar"
        aria-label="시뮬레이션 제어"
      >
        <span
          class="badge dash-header__virtual"
          title="브라우저 안의 시뮬레이션 엔진이 만든 가상 데이터입니다"
        >가상 데이터</span>
        <span
          class="clock"
          aria-label="시뮬레이션 시각"
        >🕒 {{ clock }}</span>
        <button
          class="btn btn--small"
          :aria-pressed="sim.playing"
          @click="sim.toggle()"
        >
          {{ sim.playing ? '⏸ 일시정지' : '▶ 재생' }}
        </button>
        <div
          class="speed-group"
          role="group"
          aria-label="배속"
        >
          <button
            v-for="option in SPEED_OPTIONS"
            :key="option"
            class="btn btn--small"
            :class="{ 'btn--active': sim.speed === option }"
            :aria-pressed="sim.speed === option"
            @click="sim.setSpeed(option)"
          >
            {{ option }}×
          </button>
        </div>
      </div>
    </header>

    <main class="dash-main">
      <slot />
    </main>
  </div>
</template>
