import { watch } from 'vue'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { loginGuard } from './auth/guard'
import { currentUser } from './auth/session'
import EquipmentView from './views/EquipmentView.vue'
import LoginView from './views/LoginView.vue'
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
    /** true면 사이드바에 보이지 않는다(라우트와 페이지는 남겨 주소로는 열린다) */
    hidden?: boolean
    /** true면 로그인하지 않아도 열린다 */
    public?: boolean
  }
}

/**
 * 페이지는 MES 기능 단위로 나눈다(docs/dashboard-plan.md).
 * 아직 보여 줄 데이터가 없는 메뉴(자재 · 리포트)는 hidden으로 사이드바에서 숨긴다.
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
    meta: { title: '자재 / 재고', icon: '📦', hidden: true },
  },
  {
    path: '/reports',
    name: 'reports',
    component: ReportView,
    meta: { title: '실적 리포트', icon: '📈', hidden: true },
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { title: '로그인', icon: '🔐', fullscreen: true, public: true },
  },
  {
    path: '/simulator',
    name: 'simulator',
    // 3D 장면(three.js)이 커서 자동 시뮬레이션 화면에 들어올 때만 불러온다
    component: () => import('./views/SimulatorView.vue'),
    // 사람이 보는 화면이 아니라 설비 역할의 데이터 발생기라 로그인 없이 연다
    meta: { title: '자동 시뮬레이션', icon: '🏭', fullscreen: true, public: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(loginGuard)

// 화면이 열려 있는 동안 로그아웃 상태가 되면(다른 탭에서 로그아웃 · 캐시에서 되살아난 페이지) 지금 화면에도 로그인 검사를 다시 건다
watch(currentUser, (user) => {
  const current = router.currentRoute.value
  if (user) return
  // 로그인 검사와 같은 규칙으로 로그인 화면 주소를 만든다(현재 화면이 공개면 그대로 둔다)
  const target = loginGuard(current)
  if (target !== true) void router.replace(target)
})
