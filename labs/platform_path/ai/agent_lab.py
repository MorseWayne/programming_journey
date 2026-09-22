"""Offline teaching models: lexical retrieval and a durable tool workflow.

No model call, embedding, network access, or production credential is involved.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import tempfile
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Document:
    id: str
    tenant: str
    text: str
    version: int = 1


DOCUMENTS = (
    Document("retry-v1", "game-a", "A request timeout has an unknown result. Retry with the same request id."),
    Document("fencing-v1", "game-a", "The storage rejects an old owner write with a stale fencing token."),
    Document("award-v1", "game-a", "A credit transaction stores a receipt and an outbox event together."),
    Document("billing-v1", "game-b", "Private billing escrow reconciliation belongs to game-b."),
)


def tokens(text: str) -> set[str]:
    # Intentionally limited to English fixture vocabulary; not a Chinese tokenizer.
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def retrieve(tenant: str, query: str, k: int = 2,
             documents: tuple[Document, ...] = DOCUMENTS) -> list[Document]:
    if k < 1:
        raise ValueError("k must be positive")
    query_tokens = tokens(query)
    if not query_tokens:
        return []
    # Authorization scope is applied before ranking.
    scored = [
        (len(query_tokens & tokens(doc.text)), doc)
        for doc in documents if doc.tenant == tenant
    ]
    scored = [(score, doc) for score, doc in scored if score > 0]
    scored.sort(key=lambda pair: (-pair[0], pair[1].id))
    return [doc for _, doc in scored[:k]]


def answer(tenant: str, query: str) -> dict:
    docs = retrieve(tenant, query)
    if not docs:
        return {"status": "refused", "sources": [], "evidence": []}
    # Evidence extraction only, not generative answering or a safety filter for an LLM.
    return {
        "status": "evidence_found",
        "sources": [doc.id for doc in docs],
        "evidence": [doc.text for doc in docs],
    }


class Workflow:
    """Each connection is explicitly closed; each state change has a transaction."""
    def __init__(self, path: Path):
        self.path = path
        with closing(sqlite3.connect(path)) as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS runs(
                    tenant TEXT, run_id TEXT, payload TEXT, state TEXT,
                    result TEXT, PRIMARY KEY(tenant,run_id));
                CREATE TABLE IF NOT EXISTS tool_effects(
                    tenant TEXT, operation_id TEXT, payload TEXT, result TEXT,
                    PRIMARY KEY(tenant,operation_id));
            """)
            db.commit()

    def create_ticket(self, tenant: str, run_id: str, payload: dict, *,
                      approved: bool, fail_after_effect: bool = False) -> dict:
        if not approved:
            raise PermissionError("ticket creation needs approval")
        if not tenant or not run_id or not isinstance(payload.get("summary"), str):
            raise ValueError("tenant, run ID and summary are required")
        encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False)
        with closing(sqlite3.connect(self.path, timeout=5)) as db:
            with db:
                db.execute("BEGIN IMMEDIATE")
                row = db.execute(
                    "SELECT payload,state,result FROM runs WHERE tenant=? AND run_id=?",
                    (tenant, run_id),
                ).fetchone()
                if row and row[0] != encoded:
                    raise ValueError("run ID parameter conflict")
                if row and row[1] == "complete":
                    return json.loads(row[2])
                db.execute(
                    "INSERT OR IGNORE INTO runs VALUES (?,?,?,'pending',NULL)",
                    (tenant, run_id, encoded),
                )
            # Model an idempotent external tool with a separate commit boundary.
            with db:
                db.execute("BEGIN IMMEDIATE")
                effect = db.execute(
                    "SELECT payload,result FROM tool_effects WHERE tenant=? AND operation_id=?",
                    (tenant, run_id),
                ).fetchone()
                if effect and effect[0] != encoded:
                    raise ValueError("tool operation parameter conflict")
                if effect:
                    result = json.loads(effect[1])
                else:
                    result = {"ticket_id": f"{tenant}/{run_id}", "summary": payload["summary"]}
                    db.execute(
                        "INSERT INTO tool_effects VALUES (?,?,?,?)",
                        (tenant, run_id, encoded, json.dumps(result, ensure_ascii=False)),
                    )
            if fail_after_effect:
                raise RuntimeError("injected crash after tool commit")
            with db:
                db.execute(
                    "UPDATE runs SET state='complete',result=? WHERE tenant=? AND run_id=?",
                    (json.dumps(result, ensure_ascii=False), tenant, run_id),
                )
            return result

    def effect_count(self) -> int:
        with closing(sqlite3.connect(self.path)) as db:
            return db.execute("SELECT COUNT(*) FROM tool_effects").fetchone()[0]


def evaluate(path: Path) -> dict:
    cases = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    if not cases:
        raise ValueError("empty evaluation set")
    retrieval_total = refusal_total = hits = correct_refusals = unsafe = 0
    failures = []
    for case in cases:
        result = answer(case["tenant"], case["query"])
        if case["should_refuse"]:
            refusal_total += 1
            correct = result["status"] == "refused"
            correct_refusals += int(correct)
            unsafe += int(not correct)
        else:
            retrieval_total += 1
            correct = bool(set(case["expected_sources"]) & set(result["sources"]))
            hits += int(correct)
        if not correct:
            failures.append(case["id"])
    return {
        "cases": len(cases),
        "answerable_cases": retrieval_total,
        "refusal_cases": refusal_total,
        "hit_at_2": hits / retrieval_total if retrieval_total else None,
        "correct_refusal_rate": correct_refusals / refusal_total if refusal_total else None,
        "false_accepts": unsafe,
        "failures": failures,
        "model_calls": 0,
        "scope": "fixture retrieval and refusal only; not LLM answer quality",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    retrieval = sub.add_parser("retrieve")
    retrieval.add_argument("--tenant", default="game-a")
    retrieval.add_argument("--query", required=True)
    evaluation = sub.add_parser("evaluate")
    evaluation.add_argument("--cases", type=Path, default=Path(__file__).with_name("cases.jsonl"))
    sub.add_parser("workflow-demo")
    args = parser.parse_args()
    if args.command == "retrieve":
        result = answer(args.tenant, args.query)
    elif args.command == "evaluate":
        result = evaluate(args.cases)
    else:
        with tempfile.TemporaryDirectory(prefix="arena-workflow-") as directory:
            path = Path(directory) / "workflow.db"
            flow = Workflow(path)
            try:
                flow.create_ticket("game-a", "op-1", {"summary": "inspect latency"},
                                   approved=True, fail_after_effect=True)
            except RuntimeError:
                pass
            # A fresh object simulates re-opening durable state.
            resumed = Workflow(path)
            result = resumed.create_ticket("game-a", "op-1", {"summary": "inspect latency"},
                                           approved=True)
            result["effects_after_resume"] = resumed.effect_count()
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
