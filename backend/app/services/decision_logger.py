import json
import uuid
from datetime import datetime, timezone
from typing import Any

from app.core.config import MODEL_VERSION, RULE_VERSION
from app.db.sqlite import get_connection, initialize_database
from app.schemas.decision import DecisionCreateRequest
from app.services.optimizer import SequenceEvaluator


class DecisionLogger:
    """Persists confirmed decisions and reads them back for KPI dashboards."""

    def __init__(self) -> None:
        initialize_database()

    def save_decision(self, request: DecisionCreateRequest) -> dict[str, str]:
        evaluator = SequenceEvaluator()
        comparison = evaluator.compare(
            request.plan_id,
            request.recommended_sequence,
            request.confirmed_sequence,
            request.priority_profile,
        )
        recommended_cost = comparison["baseline_evaluation"]
        confirmed_cost = comparison["current_evaluation"]
        violation_details = confirmed_cost["risk_warnings"]
        decision_id = f"DEC-{uuid.uuid4().hex[:12].upper()}"
        created_at = datetime.now(timezone.utc).isoformat()

        with get_connection() as connection:
            connection.execute(
                """
                INSERT INTO decisions (
                  decision_id, plan_id, recommended_sequence, confirmed_sequence,
                  priority_profile, recommended_cost, confirmed_cost, comparison_state,
                  violation_details, decision_memo, reviewed, model_version, rule_version,
                  created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
                """,
                (
                    decision_id,
                    request.plan_id,
                    json.dumps(request.recommended_sequence, ensure_ascii=False),
                    json.dumps(request.confirmed_sequence, ensure_ascii=False),
                    json.dumps(request.priority_profile, ensure_ascii=False),
                    json.dumps(recommended_cost, ensure_ascii=False),
                    json.dumps(confirmed_cost, ensure_ascii=False),
                    json.dumps(comparison["comparison_state"], ensure_ascii=False),
                    json.dumps(violation_details, ensure_ascii=False),
                    request.decision_memo,
                    MODEL_VERSION,
                    RULE_VERSION,
                    created_at,
                ),
            )

        return {"decision_id": decision_id, "committed_at": created_at}

    def get_decision(self, decision_id: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            row = connection.execute(
                "SELECT * FROM decisions WHERE decision_id = ?",
                (decision_id,),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_decision(row)

    def list_decisions(self) -> list[dict[str, Any]]:
        with get_connection() as connection:
            rows = connection.execute(
                "SELECT * FROM decisions ORDER BY created_at DESC"
            ).fetchall()
        return [self._row_to_decision(row) for row in rows]

    def update_reviewed(self, decision_id: str, reviewed: bool) -> bool:
        with get_connection() as connection:
            cursor = connection.execute(
                "UPDATE decisions SET reviewed = ? WHERE decision_id = ?",
                (1 if reviewed else 0, decision_id),
            )
        return cursor.rowcount > 0

    @staticmethod
    def _row_to_decision(row: Any) -> dict[str, Any]:
        data = dict(row)
        for key in [
            "recommended_sequence",
            "confirmed_sequence",
            "priority_profile",
            "recommended_cost",
            "confirmed_cost",
            "comparison_state",
            "violation_details",
        ]:
            data[key] = json.loads(data[key])
        data["reviewed"] = bool(data["reviewed"])
        return data
