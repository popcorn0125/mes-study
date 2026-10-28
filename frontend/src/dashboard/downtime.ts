import type { DowntimeBar, DowntimeReason } from '@/api/downtime'
import { formatDuration } from './equipment'
import { formatRatio } from './oee'
import { markVitalFew, type ParetoRow } from './pareto'

/** 서버 비가동 파레토를 막대 줄로 바꾼다. 사유 미입력 · 순간 정지는 강조하지 않는다 */
export function toDowntimeParetoRows(bars: readonly DowntimeBar[]): ParetoRow[] {
  return markVitalFew(bars, (b) => b.seconds, (b) => b.cumulativeRatio, (b) => b.kind !== 'REASON')
    .map(({ item, share, vital }) => ({
      key: item.reasonCode ?? item.kind,
      name: item.reasonName,
      note: item.kind === 'REASON' ? item.category : item.kind === 'PENDING' ? '60초 이상 · 사유를 넣어 주세요' : '60초 미만 · 사유를 받지 않음',
      value: `${formatDuration(item.seconds)} · ${item.count}건 · 누적 ${formatRatio(item.cumulativeRatio)}`,
      share,
      vital,
      tone: item.kind === 'REASON' ? 'normal' : item.kind === 'PENDING' ? 'pending' : 'muted',
    }))
}

/** 선택 상자용: 대분류마다 사유를 묶는다(서버 순서 유지) */
export function groupReasons(reasons: readonly DowntimeReason[]): { category: string; reasons: DowntimeReason[] }[] {
  const groups: { category: string; reasons: DowntimeReason[] }[] = []
  for (const reason of reasons) {
    const group = groups.find((g) => g.category === reason.category)
    if (group) group.reasons.push(reason)
    else groups.push({ category: reason.category, reasons: [reason] })
  }
  return groups
}
