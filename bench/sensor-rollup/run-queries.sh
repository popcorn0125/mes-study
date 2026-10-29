#!/usr/bin/env bash
# 조회 비교: history-queries.sql의 쿼리마다 EXPLAIN (ANALYZE, BUFFERS)를 6번 돌려 첫 번째(캐시 데우기)를 버리고 5번의 중앙값을 쓴다.
#   PGPASSWORD=... bench/sensor-rollup/run-queries.sh before
# 결과: docs/experiments/sensor-rollup/data/<label>/queries.csv · plans/<쿼리>.txt · sizes.csv
set -euo pipefail

LABEL=$1
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HERE=$ROOT/bench/sensor-rollup
OUT=$ROOT/docs/experiments/sensor-rollup/data/$LABEL
DB=mes_bench_query
T_END='2026-10-28 00:00:00+09'
RUNS=5
PSQL=(psql -X -q -d "$DB" -v ON_ERROR_STOP=1 -v t_end="$T_END")
mkdir -p "$OUT/plans"

query_body() {
  awk -v name="$1" '
    /^-- name: / { on = ($3 == name); next }
    on && !/^--/ { print }
  ' "$HERE/history-queries.sql" | sed -e 's/;[[:space:]]*$//'
}
median() { tr ' ' '\n' | sort -n | awk '{ a[NR] = $1 } END { print (NR % 2) ? a[(NR + 1) / 2] : (a[NR / 2] + a[NR / 2 + 1]) / 2 }'; }

echo "query,median_ms,runs_ms,rows_read,shared_hit,shared_read" > "$OUT/queries.csv"
for q in $(sed -n 's/^-- name: //p' "$HERE/history-queries.sql"); do
  sql="EXPLAIN (ANALYZE, BUFFERS) $(query_body "$q");"
  script=""
  for _ in $(seq 0 $RUNS); do script+="$sql"$'\n'"\\echo ----"$'\n'; done
  out=$("${PSQL[@]}" -At <<< "$script")
  # 마지막 실행 계획을 남긴다
  echo "$out" | awk 'BEGIN { RS = "----\n" } { last = $0 } END { printf "%s", last }' > "$OUT/plans/$q.txt"
  times=$(echo "$out" | sed -n 's/^Execution Time: \([0-9.]*\) ms$/\1/p' | tail -n $RUNS | tr '\n' ' ')
  med=$(echo "$times" | median)
  plan="$OUT/plans/$q.txt"
  # 테이블에서 실제로 읽은 행: 스캔 노드(Seq/Index/Bitmap Heap)의 actual rows × loops 합
  rows_read=$(grep -E "(Seq Scan|Index Scan|Index Only Scan|Bitmap Heap Scan)" "$plan" \
    | sed -n 's/.*actual time=[0-9.]*\.\.[0-9.]* rows=\([0-9]*\) loops=\([0-9]*\).*/\1 \2/p' | awk '{ s += $1 * $2 } END { print s + 0 }')
  hit=$(grep -m1 "Buffers:" "$plan" | sed -n 's/.*shared hit=\([0-9]*\).*/\1/p'); hit=${hit:-0}
  rd=$(grep -m1 "Buffers:" "$plan" | sed -n 's/.*read=\([0-9]*\).*/\1/p'); rd=${rd:-0}
  echo "$q,$med,\"$times\",$rows_read,$hit,$rd" >> "$OUT/queries.csv"
  echo "$q: ${med}ms (읽은 행 $rows_read)"
done

echo "table,rows,heap_bytes,index_bytes,total_bytes" > "$OUT/sizes.csv"
"${PSQL[@]}" -At -F, -c "
  SELECT relname, reltuples::bigint, pg_relation_size(oid), pg_indexes_size(oid), pg_total_relation_size(oid)
  FROM pg_class WHERE relname IN ('equipment_sensor_log', 'equipment_sensor_minute', 'equipment_status_change') AND relkind = 'r'
  ORDER BY relname" >> "$OUT/sizes.csv"
cat "$OUT/sizes.csv"
