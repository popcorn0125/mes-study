// 설비 N대가 각자 1초에 1번 센서 로그를 보내는 부하. 실제 공장처럼 설비(게이트웨이)마다 요청이 따로 온다.
//   k6 run -e BASE_URL=http://localhost:8081 -e DEVICES=50 --summary-export 결과.json bench/sensor-rollup/ingest.js
//
// 데우기 1분(warmup)은 버리고, 측정 4분(measure)만 결과에 쓴다. 결과는 scenario:measure 태그로 나눈다.
// 시각은 반복 번호로 정한다: n번째 반복 = (n / DEVICES)초째, 설비 n % DEVICES. 그래서 같은 설비 · 같은 초가 두 번 오지 않는다.
import http from 'k6/http'
import { check } from 'k6'
import exec from 'k6/execution'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8081'
const DEVICES = Number(__ENV.DEVICES || 5)
const WARMUP_SEC = Number(__ENV.WARMUP_SEC || 60)
const MEASURE_SEC = Number(__ENV.MEASURE_SEC || 240)

const arrival = (startSec, durationSec) => ({
  executor: 'constant-arrival-rate',
  rate: DEVICES,
  timeUnit: '1s',
  duration: `${durationSec}s`,
  startTime: `${startSec}s`,
  preAllocatedVUs: Math.max(10, DEVICES * 2),
  maxVUs: Math.max(50, DEVICES * 10),
})

export const options = {
  scenarios: {
    warmup: { ...arrival(0, WARMUP_SEC), env: { OFFSET_SEC: '0' } },
    measure: { ...arrival(WARMUP_SEC, MEASURE_SEC), env: { OFFSET_SEC: String(WARMUP_SEC) } },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  // 시나리오별 값이 요약에 나오게 빈 임계값을 건다
  thresholds: {
    'http_req_duration{scenario:measure}': [],
    'http_req_failed{scenario:measure}': [],
    'http_reqs{scenario:measure}': [],
    'dropped_iterations{scenario:measure}': [],
  },
}

// 시뮬레이터처럼 실행 ID를 받아 둔다(활성 실행만 수신한다)
export function setup() {
  const res = http.post(`${BASE_URL}/api/v1/producer/runs`)
  if (res.status !== 200) throw new Error(`실행 시작 실패: ${res.status} ${res.body}`)
  return { runId: res.json('runId'), t0: Math.floor(Date.now() / 1000) * 1000 }
}

// 설비 · 2분 구간마다 상태를 정한다(RUN 85% · IDLE 7% · WARN 5% · DOWN 3%). 인덱스 실험 데이터와 같은 분포
function statusOf(device, sec) {
  let h = (device * 2654435761 + Math.floor(sec / 120) * 40503) >>> 0
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
  const p = h % 100
  if (p < 85) return 'RUN'
  if (p < 92) return 'IDLE'
  if (p < 97) return 'WARN'
  return 'DOWN'
}

const round2 = (v) => Math.round(v * 100) / 100

export default function (data) {
  const n = exec.scenario.iterationInTest
  const device = n % DEVICES
  const sec = Number(__ENV.OFFSET_SEC) + Math.floor(n / DEVICES)
  const status = statusOf(device, sec)
  const log = {
    equipmentId: `BENCH_${String(device + 1).padStart(3, '0')}`,
    timestamp: new Date(data.t0 + sec * 1000).toISOString(),
    status,
    metrics: {
      temperature: round2((status === 'WARN' ? 78 : status === 'IDLE' ? 40 : 60) + Math.random() * 10),
      vibration: round2((status === 'WARN' ? 4 : 1) + Math.random()),
    },
  }
  const res = http.post(`${BASE_URL}/api/v1/sensor-logs/bulk`, JSON.stringify([log]), {
    headers: { 'Content-Type': 'application/json', 'X-Producer-Run-Id': data.runId },
  })
  check(res, { '200': (r) => r.status === 200 })
}
