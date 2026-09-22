#!/usr/bin/env bash
# A deterministic stale-fill interleaving in the isolated course services.
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
course_ns="cache-lab-$(date +%s)-$$"
course_key="arena:${course_ns}:u1:balance"
course_sql() {
  docker compose exec -T mysql mysql -uroot -pjourney-local-only -N -B journey_lab -e "$1"
}
course_redis() { docker compose exec -T redis redis-cli --raw "$@"; }
course_sql "INSERT INTO wallets(ns,uid,balance) VALUES('$course_ns','u1',100);"
# Reader A fetched 100 but has not filled the cache yet.
course_old=$(course_sql "SELECT balance FROM wallets WHERE ns='$course_ns' AND uid='u1';")
# Writer B commits 110 and invalidates the cache.
course_sql "UPDATE wallets SET balance=110 WHERE ns='$course_ns' AND uid='u1';"
course_redis DEL "$course_key" >/dev/null
# A resumes and fills the cache with its earlier read.
course_redis SET "$course_key" "$course_old" EX 60 >/dev/null
course_db=$(course_sql "SELECT balance FROM wallets WHERE ns='$course_ns' AND uid='u1';")
course_cache=$(course_redis GET "$course_key")
printf 'database=%s cache=%s\n' "$course_db" "$course_cache"
test "$course_db" = 110
test "$course_cache" = 100
printf 'PASS: stale fill reproduced; synthetic cache key expires in 60 seconds.\n'
