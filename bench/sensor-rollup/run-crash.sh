#!/usr/bin/env bash
# 복구 확인: 설비 50대 부하 중에 백엔드를 kill -9로 죽이고 다시 띄운 뒤, DB 1분 요약의 행 수 합이 스풀 원본 수와 같은지 본다.
#   PGPASSWORD=... bench/sensor-rollup/run-crash.sh
# 결과: docs/experiments/sensor-rollup/data/crash/crash.txt (+ k6 · 백엔드 로그)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HERE=$ROOT/bench/sensor-rollup
OUT=$ROOT/docs/experiments/sensor-rollup/data/crash
DB=mes_bench_ingest
PORT=8081
DEVICES=50
JAR=$ROOT/backend/build/libs/backend-0.0.1-SNAPSHOT.jar
DUCK=$(find ~/.gradle/caches -name "duckdb_jdbc-1.1.3.jar" | head -1)
PSQL=(psql -X -q -d "$DB" -v ON_ERROR_STOP=1)
mkdir -p "$OUT"
cd "$ROOT"
rm -rf data/spool data/archive

start_backend() {
  java -jar "$JAR" --server.port=$PORT --spring.datasource.url=jdbc:postgresql://localhost:5432/$DB >> "$OUT/backend.log" 2>&1 &
  BACKEND=$!
  until curl -sf "http://localhost:$PORT/api/v1/equipment" > /dev/null; do sleep 0.2; done
}
db_samples() { "${PSQL[@]}" -At -c "SELECT COALESCE(sum(sample_count), 0) FROM equipment_sensor_minute"; }
spool_rows() { java -cp "$DUCK" "$HERE/SpoolCount.java" "$ROOT/data/spool/*.csv"; }
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$OUT/crash.txt"; }

: > "$OUT/crash.txt"; : > "$OUT/backend.log"
"${PSQL[@]}" -f "$HERE/reset.sql"
start_backend
k6 run --quiet -e BASE_URL="http://localhost:$PORT" -e DEVICES=$DEVICES -e WARMUP_SEC=10 -e MEASURE_SEC=170 \
  "$HERE/ingest.js" > "$OUT/k6.txt" 2>&1 &
K6=$!

sleep 95
kill -9 $BACKEND
log "kill -9 (설비 ${DEVICES}대 부하 중)"
log "  DB 1분 요약 행 수 합 = $(db_samples)   ← 메모리에 있던 이번 분 · 지난 분 일부가 빠져 있다"
log "  스풀 원본 수         = $(spool_rows)   ← 정답(서버가 받은 값)"

start_backend
log "다시 띄움(시작할 때 스풀로 복구)"
log "  DB 1분 요약 행 수 합 = $(db_samples)"
grep "센서 요약 복구" "$OUT/backend.log" | sed 's/.*: /  로그: /' | tee -a "$OUT/crash.txt"

wait $K6 || true
sleep 70   # 마지막 분이 끝나고 플러시될 때까지
log "부하 끝 + 70초"
log "  DB 1분 요약 행 수 합 = $(db_samples)"
log "  스풀 원본 수         = $(spool_rows)"
log "  k6 요청 실패(죽어 있던 동안) = $(grep -A1 '^    http_req_failed' "$OUT/k6.txt" | head -1 | awk '{print $2, $3, $4, $5, $6}')"
kill $BACKEND
