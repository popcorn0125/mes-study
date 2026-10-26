import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findAccount } from './accounts'
import { SESSION_KEY, currentUser, isLoggedIn, login, logout, syncSessionFromStorage } from './session'

/** 테스트 환경(node)에는 localStorage가 없어 Map으로 흉내 낸다 */
function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  }
}

describe('로그인 상태', () => {
  let storage: ReturnType<typeof fakeStorage>

  beforeEach(() => {
    storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    syncSessionFromStorage()
  })
  afterEach(() => {
    logout()
    vi.unstubAllGlobals()
  })

  it('데모 계정으로 로그인하면 사용자 정보가 생기고 아이디만 저장한다(비밀번호는 저장하지 않음)', () => {
    expect(login('admin', 'admin1234')).toBe(true)

    expect(isLoggedIn()).toBe(true)
    expect(currentUser.value).toEqual({ username: 'admin', name: '김관리', role: '관리자', avatarUrl: undefined })
    expect([...storage.map.values()]).toEqual(['admin'])
  })

  it('비밀번호가 틀리거나 없는 아이디면 로그인하지 않는다', () => {
    expect(login('admin', 'wrong')).toBe(false)
    expect(login('nobody', 'admin1234')).toBe(false)
    expect(isLoggedIn()).toBe(false)
  })

  it('아이디 앞뒤 공백은 무시한다', () => {
    expect(findAccount('  operator ', 'operator1234')?.name).toBe('이현장')
  })

  it('저장된 아이디로 로그인 상태를 되살리고, 모르는 아이디면 로그아웃 상태로 둔다', () => {
    storage.setItem(SESSION_KEY, 'operator')
    syncSessionFromStorage()
    expect(currentUser.value?.name).toBe('이현장')

    storage.setItem(SESSION_KEY, 'deleted-user')
    syncSessionFromStorage()
    expect(isLoggedIn()).toBe(false)
  })

  it('로그아웃하면 저장된 상태도 지운다', () => {
    login('admin', 'admin1234')
    logout()
    expect(isLoggedIn()).toBe(false)
    expect(storage.map.size).toBe(0)
  })

  it('저장소를 쓸 수 없어도 이번 탭에서는 로그인된다', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    })
    syncSessionFromStorage()

    expect(login('admin', 'admin1234')).toBe(true)
    expect(currentUser.value?.name).toBe('김관리')
  })
})
