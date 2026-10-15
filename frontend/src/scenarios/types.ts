import type { MasterData } from '@/domain/types'
import type { SimCommand } from '@/sim/commands'
import type { SimEngine } from '@/sim/engine'

/** 특정 시각(초)에 적용할 명령. 모범 조치와 사용자 조치 기록에 쓴다. */
export interface TimedCommand {
  time: number
  command: SimCommand
}

/** 결과표 지표 */
export interface ScenarioMetrics {
  /** 양품 수 */
  good: number
  scrap: number
  /** 평균 시간당 생산량(양품 ÷ 경과 시간) */
  uph: number
  avgWip: number
  /** 평균 리드타임(초) */
  avgLeadTime: number
  /** 고장 + 예방정비 시간 합계(초) */
  downtime: number
  failures: number
  /** 자재 부족으로 멈춘 시간 합계(초) */
  materialStop: number
  /** 긴급 발주 할증(원) */
  expediteCost: number
  /** 납기가 있는 작업지시 중 납기 내 완료 수 / 전체 */
  onTime: { met: number; total: number }
}

export type MetricKey = Exclude<keyof ScenarioMetrics, 'onTime'> | 'onTime'

export interface MetricSpec {
  key: MetricKey
  label: string
  /** 클수록 좋은 지표인지 */
  higherIsBetter: boolean
}

export interface ScenarioResult {
  baseline: ScenarioMetrics
  mine: ScenarioMetrics
  best: ScenarioMetrics
  /** 결과 해설(사용자 결과·조치에 따라 달라진다) */
  insights: string[]
}

export interface ScenarioDefinition {
  id: string
  /** 목록 카드 제목 */
  title: string
  /** 한 줄 요약 */
  summary: string
  /** 생산관리자 입장의 상황 설명 */
  briefing: string[]
  /** 이번 시나리오에서 찾아볼 것 */
  hints: string[]
  /** 배우는 것 */
  lessons: string[]
  /** 시나리오 진행 시간(시뮬 초). null이면 자유 모드(시간 제한·결과표 없음) */
  duration: number | null
  seed: number
  createMaster: () => MasterData
  /** 엔진 생성 직후 초기 작업지시 등 설정 */
  setup: (engine: SimEngine) => void
  /** 결과표 "모범 조치" 열에 쓰는 조치 */
  bestActions: TimedCommand[]
  /** 모범 조치 설명(결과표에 표시) */
  bestActionsLabel: string
  /** 결과표에 보여줄 지표 */
  metrics: MetricSpec[]
  /** 결과 해설 규칙 */
  explain?: (result: Omit<ScenarioResult, 'insights'>, actions: TimedCommand[]) => string[]
}
