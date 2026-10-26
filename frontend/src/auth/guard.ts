import type { RouteLocationRaw } from 'vue-router'
import { isLoggedIn } from './session'

/**
 * 로그인 뒤 돌아갈 주소. 같은 사이트 안의 경로("/..."로 시작, "//" 제외)만 받아
 * ?redirect=https://다른사이트 같은 주소로 밖으로 내보내지 않는다.
 */
export function safeRedirect(redirect: unknown): string {
  return typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
}

/** 검사에 필요한 이동 대상 정보(vue-router의 RouteLocation 중 일부) */
export interface GuardTarget {
  name?: unknown
  fullPath: string
  meta: { public?: boolean }
  query: Record<string, unknown>
}

/**
 * 로그인 검사: 로그인하지 않았으면 로그인 화면으로 보내고(원래 주소는 redirect로 넘김),
 * 이미 로그인했는데 로그인 화면을 열면 원래 가려던 곳으로 보낸다.
 */
export function loginGuard(to: GuardTarget): RouteLocationRaw | true {
  if (!to.meta.public && !isLoggedIn()) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.name === 'login' && isLoggedIn()) return safeRedirect(to.query.redirect)
  return true
}
