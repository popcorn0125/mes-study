"""run-ingest.sh 결과(db.csv · k6-N.json · activity-N.csv)를 설비 수마다 한 줄로 정리한다.

  python3 bench/sensor-rollup/summarize.py docs/experiments/sensor-rollup/data/before

출력: <폴더>/summary.csv 와 화면 표. 하루 · 1년 값은 측정 구간의 초당 값을 그대로 늘린 환산이다.
"""
import csv
import json
import os
import sys

DAY = 86_400


def main(folder):
    rows = list(csv.DictReader(open(os.path.join(folder, "db.csv"))))
    points = {}
    for r in rows:
        points.setdefault(r["devices"], {})[r["point"]] = r
    out = []
    for devices, p in points.items():
        s, e = p["start"], p["end"]
        sec = float(e["epoch"]) - float(s["epoch"])
        d = lambda k: int(e[k]) - int(s[k])
        k6 = json.load(open(os.path.join(folder, f"k6-{devices}.json")))["metrics"]
        dur = k6["http_req_duration{scenario:measure}"]
        reqs = k6["http_reqs{scenario:measure}"]["count"]
        failed = k6["http_req_failed{scenario:measure}"]
        dropped = k6.get("dropped_iterations{scenario:measure}", {}).get("count", 0)
        act = list(csv.DictReader(open(os.path.join(folder, f"activity-{devices}.csv"))))
        waits = [int(a["advisory_wait"]) for a in act]
        g = lambda k: int(e.get(k) or 0) - int(s.get(k) or 0)  # Before 결과에는 없는 열(After에서 더함)
        sensor_rows = int(e["sensor_rows"])
        if sensor_rows:
            # Before: 원본 1행 = 1초
            bytes_per_row = int(e["sensor_total_bytes"]) / sensor_rows
            rows_per_sec = d("sensor_rows") / sec
            db_bytes_per_sec = rows_per_sec * bytes_per_row
        else:
            # After: 1분 요약 + 상태 이력. 행 크기는 끝 시점 크기 ÷ 행 수, 늘어나는 속도는 측정 구간의 행 증가
            minute_rows = int(e.get("minute_rows") or 0)
            bytes_per_row = int(e.get("minute_total_bytes") or 0) / minute_rows if minute_rows else 0
            rows_per_sec = g("minute_rows") / sec
            change_rows = g("change_writes") / 2  # 구간 하나 = 이전 행 끝내기(UPDATE) + 새 행(INSERT)
            change_bytes = int(e.get("change_total_bytes") or 0)
            change_row_bytes = change_bytes / max(1, int(e.get("change_writes") or 0) / 2)
            db_bytes_per_sec = rows_per_sec * bytes_per_row + change_rows / sec * change_row_bytes
        out.append({
            "devices": devices,
            "requests": reqs,
            "req_per_sec": round(reqs / sec, 1),
            "p50_ms": round(dur["med"], 2),
            "p95_ms": round(dur["p(95)"], 2),
            "p99_ms": round(dur["p(99)"], 2),
            "max_ms": round(dur["max"], 2),
            "failed_pct": round(failed.get("value", failed.get("rate", 0)) * 100, 2),
            "dropped": dropped,
            "db_rows_per_sec": round(d("tup_inserted") / sec, 1),
            "sensor_rows_per_sec": round(rows_per_sec, 1),
            "commits_per_sec": round(d("xact_commit") / sec, 1),
            "wal_kb_per_sec": round(d("wal_bytes") / sec / 1024, 1),
            "wal_bytes_per_request": round(d("wal_bytes") / max(reqs, 1)),
            "lock_wait_avg": round(sum(waits) / len(waits), 2) if waits else 0,
            "lock_wait_max": max(waits) if waits else 0,
            "sensor_bytes_per_row": round(bytes_per_row),
            "sensor_mb_per_day": round(db_bytes_per_sec * DAY / 1024 / 1024, 1),
            "sensor_gb_per_year": round(db_bytes_per_sec * DAY * 365 / 1024 ** 3, 2),
            "minute_writes_per_sec": round(g("minute_writes") / sec, 2),
            "status_change_writes_per_sec": round(g("change_writes") / sec, 2),
            "spool_mb_per_day": round(g("spool_bytes") / sec * DAY / 1024 / 1024),
            "wal_gb_per_day": round(d("wal_bytes") / sec * DAY / 1024 ** 3, 2),
        })
    with open(os.path.join(folder, "summary.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)
    keys = list(out[0])
    print(" | ".join(keys))
    for o in out:
        print(" | ".join(str(o[k]) for k in keys))


if __name__ == "__main__":
    main(sys.argv[1])
