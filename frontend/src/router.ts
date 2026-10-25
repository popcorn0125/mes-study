import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import EquipmentView from './views/EquipmentView.vue'
import MaterialView from './views/MaterialView.vue'
import ProductionView from './views/ProductionView.vue'
import QualityView from './views/QualityView.vue'
import ReportView from './views/ReportView.vue'
import WorkOrderView from './views/WorkOrderView.vue'

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
    component: WorkOrderView,
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
    component: QualityView,
    meta: { title: '품질 관리', icon: '✅' },
  },
  {
    path: '/materials',
    name: 'materials',
    component: MaterialView,
    meta: { title: '자재 / 재고', icon: '📦' },
  },
  {
    path: '/reports',
    name: 'reports',
    component: ReportView,
    meta: { title: '실적 리포트', icon: '📈' },
  },
  {
    path: '/simulator',
    name: 'simulator',
    // 3D 장면(three.js)이 커서 자동 시뮬레이션 화면에 들어올 때만 불러온다
    component: () => import('./views/SimulatorView.vue'),
    meta: { title: '자동 시뮬레이션', icon: '🏭', fullscreen: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
