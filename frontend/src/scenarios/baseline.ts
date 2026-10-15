import type { MasterData, Reliability, SensorSpec } from '@/domain/types'

const HOUR = 3600

/** 가공·권선 설비: 부하가 커서 기준 온도·진동이 높다 (진동 임계값은 ISO 10816 중형 설비 구간 참고) */
const HEAVY_SENSOR: SensorSpec = {
  temperature: { base: 40, warning: 65, critical: 80 },
  vibration: { base: 2.0, warning: 4.5, critical: 7.1 },
}
const LIGHT_SENSOR: SensorSpec = {
  temperature: { base: 30, warning: 55, critical: 70 },
  vibration: { base: 1.0, warning: 2.8, critical: 4.5 },
}

/** CNC는 마모가 빨라 데모 1~2시간 안에 전조와 고장을 볼 수 있다 */
const CNC_RELIABILITY: Reliability = {
  wearPerRunHour: 0.3,
  initialWear: 0.3,
  repairTime: 20 * 60,
  maintenanceTime: 5 * 60,
  wearDefectRate: 0.15,
}
const GENERAL_RELIABILITY: Reliability = {
  wearPerRunHour: 0.04,
  initialWear: 0.1,
  repairTime: 15 * 60,
  maintenanceTime: 5 * 60,
  wearDefectRate: 0.05,
}

/**
 * 기본 공장: 소형 BLDC 모터 조립 라인.
 * 하우징 가공 → 스테이터 권선 → 조립 → 검사 → 포장
 * 표준형(A)과 고급형(B)은 같은 경로를 지나고, B는 조립·검사가 조금 더 오래 걸리며 고급 베어링을 쓴다.
 *
 * 자재 발주점은 정상 리드타임 동안의 소요량보다 크게 잡아, 기본 상태에서는 결품이 나지 않게 했다
 * (표준 베어링은 A만 생산할 때 시간당 약 120개 × 1.5시간 = 180개 소요).
 * 호출할 때마다 독립된 사본을 돌려준다(시나리오·테스트가 고쳐 써도 서로 영향이 없도록).
 */
export function createBaselineMaster(): MasterData {
  return structuredClone({
    items: [
      { id: 'MOTOR-A', name: 'BLDC 모터 표준형' },
      { id: 'MOTOR-B', name: 'BLDC 모터 고급형' },
    ],
    workCenters: [
      { id: 'MACHINING', name: '하우징 가공', inBufferCap: 5 },
      { id: 'WINDING', name: '스테이터 권선', inBufferCap: 5 },
      { id: 'ASSEMBLY', name: '조립', inBufferCap: 5 },
      { id: 'INSPECTION', name: '검사', inBufferCap: 5 },
      { id: 'PACKING', name: '포장', inBufferCap: 5 },
    ],
    equipment: [
      { id: 'MACHINING-1', name: 'CNC #1', workCenterId: 'MACHINING', sensor: HEAVY_SENSOR, reliability: CNC_RELIABILITY },
      { id: 'WINDING-1', name: '권선기 #1', workCenterId: 'WINDING', sensor: HEAVY_SENSOR, reliability: GENERAL_RELIABILITY },
      { id: 'ASSEMBLY-1', name: '조립 셀 #1', workCenterId: 'ASSEMBLY', sensor: LIGHT_SENSOR, reliability: GENERAL_RELIABILITY },
      { id: 'INSPECTION-1', name: '검사기 #1', workCenterId: 'INSPECTION', sensor: LIGHT_SENSOR, reliability: GENERAL_RELIABILITY },
      { id: 'PACKING-1', name: '포장기 #1', workCenterId: 'PACKING', sensor: LIGHT_SENSOR, reliability: GENERAL_RELIABILITY },
    ],
    routings: [
      {
        itemId: 'MOTOR-A',
        operations: [
          { seq: 10, workCenterId: 'MACHINING', cycleTime: 45, defectRate: 0.01 },
          { seq: 20, workCenterId: 'WINDING', cycleTime: 40, defectRate: 0.01 },
          { seq: 30, workCenterId: 'ASSEMBLY', cycleTime: 50, defectRate: 0.005 },
          { seq: 40, workCenterId: 'INSPECTION', cycleTime: 30, defectRate: 0.02 },
          { seq: 50, workCenterId: 'PACKING', cycleTime: 25, defectRate: 0 },
        ],
      },
      {
        itemId: 'MOTOR-B',
        operations: [
          { seq: 10, workCenterId: 'MACHINING', cycleTime: 45, defectRate: 0.01 },
          { seq: 20, workCenterId: 'WINDING', cycleTime: 40, defectRate: 0.01 },
          { seq: 30, workCenterId: 'ASSEMBLY', cycleTime: 60, defectRate: 0.005 },
          { seq: 40, workCenterId: 'INSPECTION', cycleTime: 35, defectRate: 0.02 },
          { seq: 50, workCenterId: 'PACKING', cycleTime: 25, defectRate: 0 },
        ],
      },
    ],
    materials: [
      {
        id: 'HOUSING',
        name: '하우징 소재',
        unit: '개',
        initialStock: 200,
        reorderPoint: 100,
        reorderQty: 150,
        leadTime: 1 * HOUR,
        expediteLeadTime: 15 * 60,
        unitCost: 12000,
        expediteSurcharge: 0.5,
      },
      {
        id: 'COIL',
        name: '동선 코일',
        unit: '개',
        initialStock: 200,
        reorderPoint: 100,
        reorderQty: 150,
        leadTime: 1 * HOUR,
        expediteLeadTime: 15 * 60,
        unitCost: 8000,
        expediteSurcharge: 0.5,
      },
      {
        id: 'MAGNET',
        name: '영구자석',
        unit: '개',
        initialStock: 800,
        reorderPoint: 500,
        reorderQty: 600,
        leadTime: 1.5 * HOUR,
        expediteLeadTime: 20 * 60,
        unitCost: 3000,
        expediteSurcharge: 0.6,
      },
      {
        id: 'BEARING-STD',
        name: '표준 베어링',
        unit: '개',
        initialStock: 300,
        reorderPoint: 200,
        reorderQty: 300,
        leadTime: 1.5 * HOUR,
        expediteLeadTime: 20 * 60,
        unitCost: 2500,
        expediteSurcharge: 0.6,
      },
      {
        id: 'BEARING-PRM',
        name: '고급 베어링',
        unit: '개',
        initialStock: 100,
        reorderPoint: 60,
        reorderQty: 100,
        leadTime: 1.5 * HOUR,
        expediteLeadTime: 20 * 60,
        unitCost: 9000,
        expediteSurcharge: 0.8,
      },
    ],
    bom: [
      { itemId: 'MOTOR-A', materialId: 'HOUSING', qtyPer: 1, workCenterId: 'MACHINING' },
      { itemId: 'MOTOR-B', materialId: 'HOUSING', qtyPer: 1, workCenterId: 'MACHINING' },
      { itemId: 'MOTOR-A', materialId: 'COIL', qtyPer: 1, workCenterId: 'WINDING' },
      { itemId: 'MOTOR-B', materialId: 'COIL', qtyPer: 1, workCenterId: 'WINDING' },
      { itemId: 'MOTOR-A', materialId: 'MAGNET', qtyPer: 4, workCenterId: 'ASSEMBLY' },
      { itemId: 'MOTOR-B', materialId: 'MAGNET', qtyPer: 4, workCenterId: 'ASSEMBLY' },
      { itemId: 'MOTOR-A', materialId: 'BEARING-STD', qtyPer: 2, workCenterId: 'ASSEMBLY' },
      { itemId: 'MOTOR-B', materialId: 'BEARING-PRM', qtyPer: 2, workCenterId: 'ASSEMBLY' },
    ],
  } satisfies MasterData)
}
