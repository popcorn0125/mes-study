#!/usr/bin/env bash
# 수신 요청 1건의 DB 시간 분해: 같은 문장을 pgbench로 돌려 문장별 지연(-r)과 최대 처리량을 본다.
#   PGPASSWORD=... bench/sensor-rollup/run-pgbench.sh before
# 연결 10개 = 백엔드 HikariCP 기본 풀 크기. 결과: docs/experiments/sensor-rollup/data/<label>/pgbench-*.txt
set -euo pipefail

LABEL=$1
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HERE=$ROOT/bench/sensor-rollup
OUT=$ROOT/docs/experiments/sensor-rollup/data/$LABEL
DB=mes_bench_ingest
PGBENCH=/Library/PostgreSQL/17/bin/pgbench
mkdir -p "$OUT"

for script in request request-no-insert; do
  psql -X -q -d "$DB" -f "$HERE/reset.sql"
  # 설비 200대가 1초에 1번씩 = 초당 200건으로 고정했을 때의 문장별 지연
  "$PGBENCH" -n -r -c 10 -j 4 -T 60 -R 200 -P 10 -f "$HERE/pgbench/$script.sql" "$DB" > "$OUT/pgbench-$script-200tps.txt" 2>&1
  # 속도 제한 없이: 잠금 하나로 줄 세운 지금 구조에서 초당 몇 건까지 받나
  "$PGBENCH" -n -r -c 10 -j 4 -T 30 -P 10 -f "$HERE/pgbench/$script.sql" "$DB" > "$OUT/pgbench-$script-max.txt" 2>&1
  grep -E "^tps|latency average" "$OUT/pgbench-$script-max.txt" | sed "s/^/$script max: /"
done
