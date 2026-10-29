#!/usr/bin/env bash
# 수신 부하 측정: 설비 수마다 수신 데이터를 비우고 k6로 5분(데우기 1분 + 측정 4분) 부하를 준다.
# 측정 4분 동안의 DB 카운터 차이 · 1초마다 잠금 대기 · 테이블 크기를 남긴다.
#   PGPASSWORD=... bench/sensor-rollup/run-ingest.sh before "5 50 200" [백엔드 추가 인자...]
#
# 백엔드 jar(backend/build/libs)를 측정 전용 DB mes_bench_ingest · 포트 8081로 띄운다(개발 DB · 개발 서버와 따로).
# 결과: docs/experiments/sensor-rollup/data/<label>/
#   k6-<N>.txt(터미널 요약) · k6-<N>.json(요약 JSON) · k6-<N>.html(웹 대시보드 리포트)
#   activity-<N>.csv(1초 샘플) · db.csv(측정 시작 · 끝 카운터)
set -euo pipefail

LABEL=$1
DEVICES_LIST=${2:-"5 50 200"}
shift $(( $# < 2 ? $# : 2 ))
EXTRA_ARGS=("$@")

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HERE=$ROOT/bench/sensor-rollup
OUT=$ROOT/docs/experiments/sensor-rollup/data/$LABEL
DB=mes_bench_ingest
PORT=8081
WARMUP_SEC=${WARMUP_SEC:-60}
MEASURE_SEC=${MEASURE_SEC:-240}
PSQL=(psql -X -q -d "$DB" -v ON_ERROR_STOP=1)
mkdir -p "$OUT"

cd "$ROOT"
java -jar "$ROOT"/backend/build/libs/backend-0.0.1-SNAPSHOT.jar \
  --server.port=$PORT --spring.datasource.url=jdbc:postgresql://localhost:5432/$DB ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"} \
  > "$OUT/backend.log" 2>&1 &
BACKEND=$!
SAMPLER=
trap 'kill $BACKEND $SAMPLER 2>/dev/null || true' EXIT
until curl -sf "http://localhost:$PORT/api/v1/equipment" > /dev/null; do
  kill -0 $BACKEND 2> /dev/null || { echo "백엔드가 뜨지 않았다: $OUT/backend.log"; exit 1; }
  sleep 1
done
"${PSQL[@]}" -f "$HERE/seed.sql"

# 스풀(After: 1초 원본 CSV) 크기는 백엔드를 띄운 폴더(여기서는 저장소 루트)의 data/spool
SPOOL_DIR=$ROOT/data/spool
spool_bytes() { if [ -d "$SPOOL_DIR" ]; then find "$SPOOL_DIR" -type f -exec stat -f %z {} + | awk '{ s += $1 } END { print s + 0 }'; else echo 0; fi; }
snapshot() { echo "$1,$2,$("${PSQL[@]}" -At -F, -f "$HERE/snapshot.sql"),$(spool_bytes)" >> "$OUT/db.csv"; }
echo "devices,point,epoch,tup_inserted,tup_updated,xact_commit,wal_records,wal_bytes,wal_fpi,wal_write,wal_sync,sensor_rows,sensor_table_bytes,sensor_index_bytes,sensor_total_bytes,minute_writes,minute_rows,minute_total_bytes,change_writes,change_total_bytes,spool_bytes" > "$OUT/db.csv"

for N in $DEVICES_LIST; do
  echo "== 설비 ${N}대"
  "${PSQL[@]}" -f "$HERE/reset.sql"

  echo "epoch,active,advisory_wait,io_wait,lwlock_wait" > "$OUT/activity-${N}.csv"
  ( while true; do "${PSQL[@]}" -At -F, -f "$HERE/sample-activity.sql" >> "$OUT/activity-${N}.csv"; sleep 1; done ) &
  SAMPLER=$!

  K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT="$OUT/k6-${N}.html" K6_WEB_DASHBOARD_PERIOD=2s \
    k6 run --quiet --summary-export "$OUT/k6-${N}.json" \
      -e BASE_URL="http://localhost:$PORT" -e DEVICES="${N}" -e WARMUP_SEC=$WARMUP_SEC -e MEASURE_SEC=$MEASURE_SEC \
      "$HERE/ingest.js" > "$OUT/k6-${N}.txt" 2>&1 &
  K6=$!
  # k6 setup(실행 시작)이 1초 안쪽이라 데우기가 끝나는 시점에 시작 카운터를 찍는다
  sleep $((WARMUP_SEC + 1))
  snapshot "${N}" start
  wait $K6 || echo "k6 종료 코드 $? (임계값 없음 · 실패율은 요약에서 본다)"
  snapshot "${N}" end

  kill $SAMPLER; wait $SAMPLER 2> /dev/null || true; SAMPLER=
  grep -E "http_req_duration\{scenario:measure\}|http_reqs\{scenario:measure\}|http_req_failed\{scenario:measure\}|dropped_iterations\{scenario:measure\}" -A1 "$OUT/k6-${N}.txt" || true
done
