import type { MachineKind } from '@/scene/machines/kinds'

/** [최소, 최대] */
export type Range = readonly [number, number]

export interface ProducerEquipment {
  /** 전송 페이로드의 equipmentId */
  id: string
  /** 3D 라벨 이름 */
  name: string
  /** 3D 모델 종류 */
  kind: MachineKind
  /** 작업장 이름(바닥 구역 라벨) */
  workCenterName: string
  /** 정상 가동 온도 범위(°C) */
  temperature: Range
  /** 정상 가동 진동 범위(mm/s) */
  vibration: Range
  /** 택트 타임(초): 이 시간마다 1개를 완성한다 */
  tactTime: number
  /** 자재를 쓰는 공정인지(AGV가 들른다) */
  usesMaterials: boolean
}

/**
 * 3D 라인에 놓인 설비(라인 순서). 가공 · 권선은 부하가 커서 온도 · 진동 범위가 높다.
 * 범위는 각 설비의 경고 기준(가공 · 권선 65°C · 4.5mm/s, 그 외 55°C · 2.8mm/s) 아래로 잡았다.
 * 택트 타임은 기본 공장의 표준 사이클타임(표준형 A)이다.
 */
export const PRODUCER_EQUIPMENT: readonly ProducerEquipment[] = [
  { id: 'CNC_01', name: 'CNC #1', kind: 'cnc', workCenterName: '하우징 가공', temperature: [38, 60], vibration: [1.5, 3.5], tactTime: 45, usesMaterials: true },
  { id: 'WINDER_01', name: '권선기 #1', kind: 'winder', workCenterName: '스테이터 권선', temperature: [36, 58], vibration: [1.2, 3.2], tactTime: 40, usesMaterials: true },
  { id: 'ASSEMBLY_01', name: '조립 셀 #1', kind: 'robot', workCenterName: '조립', temperature: [28, 48], vibration: [0.6, 2.0], tactTime: 50, usesMaterials: true },
  { id: 'INSPECTION_01', name: '검사기 #1', kind: 'inspection', workCenterName: '검사', temperature: [26, 45], vibration: [0.4, 1.6], tactTime: 30, usesMaterials: false },
  { id: 'PACKER_01', name: '포장기 #1', kind: 'packer', workCenterName: '포장', temperature: [26, 45], vibration: [0.5, 1.8], tactTime: 25, usesMaterials: false },
]

/** 모든 설비가 처리 중인 작업지시(고정) */
export const WORK_ORDER_ID = 'WO-20261024-001'

/** 작업장 입력 버퍼 선반 용량(선반 높이에만 쓴다) */
export const BUFFER_CAPACITY = 5

/** 자재 창고 랙(정적 표시): 자재 이름과 재고 */
export const RACK_MATERIALS: readonly { id: string; name: string; stock: number }[] = [
  { id: 'HOUSING', name: '하우징 소재', stock: 200 },
  { id: 'COIL', name: '동선 코일', stock: 200 },
  { id: 'MAGNET', name: '영구자석', stock: 800 },
  { id: 'BEARING-STD', name: '표준 베어링', stock: 300 },
  { id: 'BEARING-PRM', name: '고급 베어링', stock: 100 },
]
