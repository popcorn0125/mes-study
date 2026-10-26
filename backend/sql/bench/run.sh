#!/usr/bin/env bash
# 인덱스 비교 실험 전체 실행: 데이터셋(A · B) × 단계(1~5) × 쿼리 5개를 측정한다.
#   PGPASSWORD=... backend/sql/bench/run.sh        (01-seed.sql로 데이터를 먼저 만들어 둔다)
#
# 쿼리마다 EXPLAIN (ANALYZE, BUFFERS)를 6번 돌려 첫 번째(캐시 데우기)는 버리고 나머지 5번의 중앙값을 쓴다.
# 결과: docs/experiments/sensor-log-index/results.csv · index-sizes.csv · insert-cost.csv · plans/*.txt
set -euo pipefail

cd "$(dirname "$0")"
OUT=../../../docs/experiments/sensor-log-index
mkdir -p "$OUT/plans"

DB=mes_bench
T_END='2026-10-24 00:00:00+09'
RUNS=5
PSQL=(psql -X -q -d "$DB" -v ON_ERROR_STOP=1 -v t_end="$T_END")

echo "dataset,stage,query,median_ms,runs_ms,scan,buffers" > "$OUT/results.csv"
echo "dataset,stage,index_name,bytes" > "$OUT/index-sizes.csv"
echo "dataset,stage,insert_ms_median,runs_ms" > "$OUT/insert-cost.csv"

# 03-queries.sql에서 "-- name: X" 아래 쿼리 본문만 꺼낸다(주석 줄 · 끝의 ; 제외)
query_body() {
  awk -v name="$1" '
    /^-- name: / { on = ($3 == name); next }
    on && !/^--/ { print }
  ' 03-queries.sql | sed -e 's/;[[:space:]]*$//'
}
QUERIES=$(sed -n 's/^-- name: //p' 03-queries.sql)

# 숫자 목록의 중앙값
median() { tr ' ' '\n' | sort -n | awk '{ a[NR] = $1 } END { print (NR % 2) ? a[(NR + 1) / 2] : (a[NR / 2] + a[NR / 2 + 1]) / 2 }'; }

for ds in a b; do
  tbl=sensor_log_$ds; eqtbl=equipment_$ds
  [ "$ds" = a ] && eq=CNC_01 || eq=EQ_01
  vars=(-v tbl="$tbl" -v eqtbl="$eqtbl" -v eq="$eq")
  DS=$(echo "$ds" | tr a-z A-Z)

  for stage in 1 2 3 4 5; do
    echo "== 데이터셋 $DS · 단계 $stage"
    "${PSQL[@]}" "${vars[@]}" -v stage="$stage" -At -F, -f 02-indexes.sql \
      | sed "s/^/$DS,$stage,/" >> "$OUT/index-sizes.csv"

    for q in $QUERIES; do
      sql="EXPLAIN (ANALYZE, BUFFERS) $(query_body "$q");"
      script=""
      for _ in $(seq 0 $RUNS); do script+="$sql"$'\n'"\\echo ----"$'\n'; done
      out=$("${PSQL[@]}" "${vars[@]}" -At <<< "$script")

      times=$(grep -o 'Execution Time: [0-9.]*' <<< "$out" | awk '{ print $3 }' | tail -n $RUNS | tr '\n' ' ')
      med=$(echo "$times" | xargs | median)
      plan=$(awk '/^----$/ { last = buf; buf = ""; next } { buf = buf $0 "\n" } END { printf "%s", last }' <<< "$out")
      scan=$(grep -oE '(Parallel )?(Seq Scan|Index Only Scan|Index Scan|Bitmap Heap Scan)( Backward)? (using [a-z_]+ )?on (sensor_log|equipment)_[ab]' <<< "$plan" \
               | sed -E 's/ on (sensor_log|equipment)_[ab]//' | awk '!seen[$0]++' | paste -sd'+' -)
      buffers=$(grep -m1 -oE 'Buffers: shared [a-z]+=[0-9]+( [a-z]+=[0-9]+)*' <<< "$plan" | sed 's/Buffers: //')

      echo "$DS,$stage,$q,$med,\"$(echo $times)\",\"$scan\",\"$buffers\"" >> "$OUT/results.csv"
      printf '%s\n' "$plan" > "$OUT/plans/${ds}-stage${stage}-${q}.txt"
      printf '   %-20s %8s ms  %s\n' "$q" "$med" "$scan"
    done

    ins=$("${PSQL[@]}" "${vars[@]}" -At -f 04-insert-cost.sql | grep -E '^[0-9.]+$' | tr '\n' ' ')
    echo "$DS,$stage,$(echo "$ins" | xargs | median),\"$(echo $ins)\"" >> "$OUT/insert-cost.csv"
    printf '   %-20s %8s ms\n' "INSERT 5행×1000" "$(echo "$ins" | xargs | median)"
  done
done
echo "완료: $OUT"
