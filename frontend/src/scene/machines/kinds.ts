/** 작업장별 설비 3D 모델 종류. 같은 작업장에 설비를 추가하면 같은 모델로 그린다. */
export type MachineKind = 'cnc' | 'winder' | 'robot' | 'inspection' | 'packer' | 'generic'

const KIND_BY_WORK_CENTER: Record<string, MachineKind> = {
  MACHINING: 'cnc',
  WINDING: 'winder',
  ASSEMBLY: 'robot',
  INSPECTION: 'inspection',
  PACKING: 'packer',
}

export function machineKind(workCenterId: string): MachineKind {
  return KIND_BY_WORK_CENTER[workCenterId] ?? 'generic'
}

/** 설비 곁 사람의 역할: 작업자 / 검사원 / 정비사(고장·정비 중에만 등장) */
export type WorkerRole = 'operator' | 'inspector' | 'technician'

/** 설비 담당자 역할. 검사 공정은 검사원이 맡는다. */
export function operatorRole(kind: MachineKind): WorkerRole {
  return kind === 'inspection' ? 'inspector' : 'operator'
}

/** 공통 재질 색 */
export const MACHINE_COLOR = {
  body: '#c5cbd3',
  dark: '#2b3138',
  steel: '#8b949e',
  glass: '#9ecbff',
  robot: '#f2b705',
  copper: '#c27c3a',
  carton: '#b08850',
} as const
