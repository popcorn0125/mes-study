import { afterEach, describe, expect, it } from 'vitest'
import { loginGuard, safeRedirect, type GuardTarget } from './guard'
import { login, logout } from './session'

/** 이동 대상 흉내 */
function to(fullPath: string, extra: Partial<GuardTarget> = {}): GuardTarget {
  return { fullPath, meta: {}, query: {}, ...extra }
}

describe('로그인 검사', () => {
  afterEach(() => logout())

  it('로그인하지 않았으면 원래 주소를 redirect로 담아 로그인 화면으로 보낸다', () => {
    expect(loginGuard(to('/equipment?equipment=CNC_01'))).toEqual({
      name: 'login',
      query: { redirect: '/equipment?equipment=CNC_01' },
    })
    expect(loginGuard(to('/'))).toEqual({ name: 'login', query: {} })
  })

  it('공개 페이지(로그인 · 자동 시뮬레이션)는 로그인 없이 연다', () => {
    expect(loginGuard(to('/simulator', { meta: { public: true } }))).toBe(true)
    expect(loginGuard(to('/login', { name: 'login', meta: { public: true } }))).toBe(true)
  })

  it('로그인했으면 대시보드는 열고, 로그인 화면은 redirect 주소로 보낸다', () => {
    login('admin', 'admin1234')
    expect(loginGuard(to('/equipment'))).toBe(true)
    expect(loginGuard(to('/login', { name: 'login', meta: { public: true }, query: { redirect: '/equipment' } }))).toBe('/equipment')
  })

  it('redirect는 사이트 안 경로만 받는다(밖으로 내보내지 않음)', () => {
    expect(safeRedirect('/equipment')).toBe('/equipment')
    expect(safeRedirect('https://evil.example')).toBe('/')
    expect(safeRedirect('//evil.example')).toBe('/')
    expect(safeRedirect(undefined)).toBe('/')
    expect(safeRedirect(['/a'])).toBe('/')
  })
})
