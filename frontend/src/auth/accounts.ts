/** 로그인한 사용자(헤더에 보일 정보) */
export interface User {
  username: string
  /** 화면에 보일 이름 */
  name: string
  /** 역할 이름 */
  role: string
  /** 프로필 사진 주소. 없으면 이름 첫 글자로 대신한다 */
  avatarUrl?: string
}

interface DemoAccount extends User {
  password: string
}

/**
 * 데모 계정. 프론트 화면 흐름을 익히기 위한 것으로, 서버 인증이 아니라 보안 기능이 아니다.
 * 로그인 화면에 그대로 안내한다.
 */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { username: 'admin', password: 'admin1234', name: '김관리', role: '관리자' },
  { username: 'operator', password: 'operator1234', name: '이현장', role: '생산 담당' },
]

/** 아이디 · 비밀번호가 맞는 계정의 사용자 정보. 틀리면 undefined */
export function findAccount(username: string, password: string): User | undefined {
  const account = DEMO_ACCOUNTS.find((a) => a.username === username.trim() && a.password === password)
  return account && toUser(account)
}

/** 아이디로 사용자 정보를 찾는다(저장된 로그인 상태를 되살릴 때) */
export function findUser(username: string): User | undefined {
  const account = DEMO_ACCOUNTS.find((a) => a.username === username)
  return account && toUser(account)
}

/** 비밀번호를 뺀 사용자 정보만 꺼낸다 */
function toUser({ username, name, role, avatarUrl }: DemoAccount): User {
  return { username, name, role, avatarUrl }
}
