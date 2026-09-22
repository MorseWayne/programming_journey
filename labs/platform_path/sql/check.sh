#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
sql() {
  docker compose exec -T mysql mysql -uroot -pjourney-local-only --batch --skip-column-names journey_lab "$@"
}
sql < sql/schema.sql
sql < sql/procedures.sql
# Unique synthetic tenant per run avoids deleting previous learner data.
lab_ns="check_$(date +%s)_$RANDOM"
sql -e "CALL grant_reward('$lab_ns','u1','r1',10); CALL grant_reward('$lab_ns','u1','r1',10);"
test "$(sql -e "SELECT balance FROM wallets WHERE ns='$lab_ns' AND uid='u1';")" = "10"
test "$(sql -e "SELECT COUNT(*) FROM outbox WHERE ns='$lab_ns';")" = "1"
if sql -e "CALL grant_reward('$lab_ns','u1','r1',20);" ; then
  echo "FAIL: conflict was accepted" >&2
  exit 1
fi
test "$(sql -e "SELECT balance FROM wallets WHERE ns='$lab_ns' AND uid='u1';")" = "10"
sql -e "CALL grant_reward('$lab_ns','u1','r2',7);" &
client_a=$!
sql -e "CALL grant_reward('$lab_ns','u1','r2',7);" &
client_b=$!
wait "$client_a"
wait "$client_b"
test "$(sql -e "SELECT balance FROM wallets WHERE ns='$lab_ns' AND uid='u1';")" = "17"
test "$(sql -e "SELECT COUNT(*) FROM outbox WHERE ns='$lab_ns';")" = "2"
other_ns="$lab_ns-b"
sql -e "CALL grant_reward('$other_ns','u1','r1',5);"
test "$(sql -e "SELECT balance FROM wallets WHERE ns='$other_ns' AND uid='u1';")" = "5"
# Force a failure after the balance update: the outbox key already exists.
sql -e "INSERT INTO outbox(ns,request_id,uid,amount) VALUES('$lab_ns','fail-after-update','u1',999);"
if sql -e "CALL grant_reward('$lab_ns','u1','fail-after-update',5);" ; then
  echo "FAIL: expected outbox uniqueness failure" >&2
  exit 1
fi
test "$(sql -e "SELECT balance FROM wallets WHERE ns='$lab_ns' AND uid='u1';")" = "17"
test "$(sql -e "SELECT COUNT(*) FROM receipts WHERE ns='$lab_ns' AND request_id='fail-after-update';")" = "0"
echo "PASS: duplicate, conflict, concurrent requests, tenant isolation, rollback"
