import { readonly, shallowRef } from 'vue'
import { findAccount, findUser, type User } from './accounts'

/** 로그인 상태를 기억하는 localStorage 키(아이디만 저장한다) */
export const SESSION_KEY = 'mes.session'

/**
 * localStorage는 사생활 보호 모드 · 차단 설정에서 읽기/쓰기가 실패할 수 있다.
 * 실패하면 저장 없이 이번 탭에서만 로그인 상태를 유지한다.
 */
function readStoredUsername(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

function writeStoredUsername(username: string | null) {
  try {
    if (username === null) localStorage.removeItem(SESSION_KEY)
    else localStorage.setItem(SESSION_KEY, username)
  } catch {
    // 저장하지 못해도 화면은 계속 쓸 수 있다
  }
}

/** 지금 로그인한 사용자. 앱이 뜰 때 저장된 아이디로 되살린다 */
const user = shallowRef<User | undefined>(restore())

/** 저장된 아이디가 데모 계정에 있으면 그 사용자로 되살린다 */
function restore(): User | undefined {
  const username = readStoredUsername()
  return username ? findUser(username) : undefined
}

/** 현재 사용자(읽기 전용). 로그아웃 상태면 undefined */
export const currentUser = readonly(user)

/** 아이디 · 비밀번호가 맞으면 로그인하고 true, 틀리면 false */
export function login(username: string, password: string): boolean {
  const found = findAccount(username, password)
  if (!found) return false
  user.value = found
  writeStoredUsername(found.username)
  return true
}

/** 로그아웃: 저장된 로그인 상태도 지운다 */
export function logout() {
  user.value = undefined
  writeStoredUsername(null)
}

/** 로그인했는지 */
export function isLoggedIn(): boolean {
  return user.value !== undefined
}

/** 저장소에서 로그인 상태를 다시 읽는다(다른 탭의 로그인 · 로그아웃, 테스트) */
export function syncSessionFromStorage() {
  user.value = restore()
}

/**
 * 메모리의 로그인 상태가 저장소와 어긋나는 두 경우를 맞춘다.
 * - 다른 탭에서 로그인 · 로그아웃했을 때(storage 이벤트)
 * - 뒤로 가기로 예전 페이지가 브라우저 캐시(bfcache)에서 그대로 되살아났을 때(pageshow persisted).
 *   로그아웃한 뒤인데 되살아난 페이지는 로그인 상태를 기억하고 있다.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_KEY || event.key === null) syncSessionFromStorage()
  })
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) syncSessionFromStorage()
  })
}
