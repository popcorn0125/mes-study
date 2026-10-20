import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import EquipmentView from './views/EquipmentView.vue'
import PlaceholderView from './views/PlaceholderView.vue'
import ProductionView from './views/ProductionView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** 사이드바·페이지 제목 */
    title: string
    /** 사이드바 아이콘 */
    icon: string
    /** true면 대시보드 레이아웃(사이드바·헤더) 없이 화면 전체를 쓴다 */
    fullscreen?: boolean
  }
}

/**
 * 페이지는 MES 기능 단위로 나눈다(docs/dashboard-plan.md).
 * 아직 만들지 않은 페이지는 PlaceholderView가 MES 기능과 익힐 개념을 보여준다.
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'production',
    component: ProductionView,
    meta: { title: '생산 현황', icon: '📊' },
  },
  {
    path: '/work-orders',
    name: 'work-orders',
    // 간트 차트(echarts custom)를 쓰므로 페이지를 열 때 불러온다
    component: () => import('./views/WorkOrderView.vue'),
    meta: { title: '작업지시 관리', icon: '📋' },
  },
  {
    path: '/equipment',
    name: 'equipment',
    component: EquipmentView,
    meta: { title: '설비 관리', icon: '⚙️' },
  },
  {
    path: '/quality',
    name: 'quality',
    component: () => import('./views/QualityView.vue'),
    meta: { title: '품질 관리', icon: '✅' },
  },
  {
    path: '/materials',
    name: 'materials',
    component: () => import('./views/MaterialView.vue'),
    meta: { title: '자재 / 재고', icon: '📦' },
  },
  {
    path: '/reports',
    name: 'reports',
    component: PlaceholderView,
    meta: { title: '실적 리포트', icon: '📈' },
    props: {
      mesFunction: '성과 분석',
      concepts: ['교대(Shift)', '일일 생산 보고'],
    },
  },
  {
    path: '/training',
    name: 'training',
    // 3D 장면(three.js)이 커서 교육 모드에 들어올 때만 불러온다
    component: () => import('./views/TrainingView.vue'),
    meta: { title: '교육 모드', icon: '🎓', fullscreen: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
