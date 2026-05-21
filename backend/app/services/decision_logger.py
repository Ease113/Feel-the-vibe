"""확정 의사결정을 SQLite에 저장하고 KPI 대시보드용 조회를 제공하는 로거."""

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
        """DB가 없으면 초기화해 항상 테이블이 존재하는 상태로 시작한다."""
        initialize_database()

    def save_decision(self, request: DecisionCreateRequest) -> dict[str, str]:
        """확정 순서를 평가·비교한 뒤 decisions 테이블에 저장하고 decision_id를 반환한다.

        DB 스키마에 없는 컬럼은 자동으로 필터링하므로 스키마 버전이 달라도 안전하다.

        Args:
            request: plan_id, recommended_sequence, confirmed_sequence 등을 담은 요청 객체.

        Returns:
            decision_id와 committed_at(UTC ISO8601)을 담은 딕셔너리.
        """
        evaluator = SequenceEvaluator()
        override = (
            request.operating_context.model_dump(exclude_none=True)
            if request.operating_context is not None
            else None
        )
        operating_context = evaluator.loader.merge_operating_context(request.plan_id, override)
        comparison = evaluator.compare(
            request.plan_id,
            request.recommended_sequence,
            request.confirmed_sequence,
            request.priority_profile,
            operating_context=operating_context,
        )
        recommended_cost = comparison["baseline_evaluation"]
        confirmed_cost = comparison["current_evaluation"]
        violation_details = confirmed_cost["risk_warnings"]
        decision_id = f"DEC-{uuid.uuid4().hex[:12].upper()}"
        confirmed_at = datetime.now(timezone.utc).isoformat()

        comparison_state = self._comparison_state_for_storage(comparison)
        cost_delta = self._cost_delta(recommended_cost, confirmed_cost)
        context_snapshot = self._context_snapshot(operating_context)

        row = {
            "decision_id": decision_id,
            "plan_id": request.plan_id,
            "user_id": "demo-manager",
            "recommended_sequence": json.dumps(request.recommended_sequence, ensure_ascii=False),
            "confirmed_sequence": json.dumps(request.confirmed_sequence, ensure_ascii=False),
            "priority_profile": json.dumps(confirmed_cost["priority_profile"], ensure_ascii=False),
            "applied_weights": json.dumps(comparison["applied_weights"], ensure_ascii=False),
            "context_snapshot": json.dumps(context_snapshot, ensure_ascii=False),
            "recommended_cost_vector": json.dumps(recommended_cost, ensure_ascii=False),
            "confirmed_cost_vector": json.dumps(confirmed_cost, ensure_ascii=False),
            "transition_costs": json.dumps(confirmed_cost["transition_costs"], ensure_ascii=False),
            "total_weighted_cost": confirmed_cost["total_weighted_cost"],
            "sequence_penalty": confirmed_cost["sequence_penalty"],
            "objective_score": confirmed_cost["objective_score"],
            "comparison_state": json.dumps(comparison_state, ensure_ascii=False),
            "comparison_summary": comparison["comparison_summary"],
            "cost_delta_vs_recommended": json.dumps(cost_delta, ensure_ascii=False),
            "violation_count": len(violation_details),
            "violation_details": json.dumps(violation_details, ensure_ascii=False),
            "decision_memo": request.decision_memo,
            "model_version": confirmed_cost.get("model_version") or MODEL_VERSION,
            "rule_version": RULE_VERSION,
            "confirmed_at": confirmed_at,
            # Legacy schema compatibility for existing demo DB files.
            "recommended_cost": json.dumps(recommended_cost, ensure_ascii=False),
            "confirmed_cost": json.dumps(confirmed_cost, ensure_ascii=False),
        }

        with get_connection() as connection:
            columns = self._table_columns(connection, "decisions")
            insert_row = {key: value for key, value in row.items() if key in columns}
            placeholders = ", ".join("?" for _ in insert_row)
            column_sql = ", ".join(insert_row)
            connection.execute(
                f"INSERT INTO decisions ({column_sql}) VALUES ({placeholders})",
                tuple(insert_row.values()),
            )

        return {"decision_id": decision_id, "committed_at": confirmed_at}

    def get_decision(self, decision_id: str) -> dict[str, Any] | None:
        """decision_id로 단건 의사결정 레코드를 조회한다. 없으면 None 반환."""
        with get_connection() as connection:
            row = connection.execute(
                "SELECT * FROM decisions WHERE decision_id = ?",
                (decision_id,),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_decision(row)

    def list_decisions(self) -> list[dict[str, Any]]:
        """confirmed_at 내림차순으로 전체 의사결정 목록을 반환한다."""
        with get_connection() as connection:
            rows = connection.execute(
                "SELECT * FROM decisions ORDER BY confirmed_at DESC"
            ).fetchall()
        return [self._row_to_decision(row) for row in rows]

    def update_reviewed(self, decision_id: str, reviewed: bool) -> bool:
        """decision의 reviewed 플래그를 갱신한다. 레코드가 없으면 False를 반환한다."""
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
            "applied_weights",
            "context_snapshot",
            "recommended_cost_vector",
            "confirmed_cost_vector",
            "transition_costs",
            "comparison_state",
            "cost_delta_vs_recommended",
            "violation_details",
        ]:
            if key in data and data[key] is not None:
                data[key] = json.loads(data[key])
        data["reviewed"] = bool(data["reviewed"])
        data["recommended_cost"] = data.get("recommended_cost_vector") or json.loads(
            data.get("recommended_cost", "{}")
        )
        data["confirmed_cost"] = data.get("confirmed_cost_vector") or json.loads(
            data.get("confirmed_cost", "{}")
        )
        return data

    @staticmethod
    def _table_columns(connection: Any, table_name: str) -> set[str]:
        rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
        return {row["name"] for row in rows}

    @staticmethod
    def _comparison_state_for_storage(comparison: dict[str, Any]) -> dict[str, Any]:
        recommended = comparison["baseline_evaluation"]["objective_score"]
        current = comparison["current_evaluation"]["objective_score"]
        diff = round(current - recommended, 2)
        diff_rate = round(diff / recommended, 4) if recommended else 0.0
        return {
            "basis": "objectiveScore",
            "recommended": recommended,
            "current": current,
            "diff": diff,
            "diff_rate": diff_rate,
            **comparison["comparison_state"],
        }

    @staticmethod
    def _cost_delta(recommended_cost: dict[str, Any], confirmed_cost: dict[str, Any]) -> dict[str, float]:
        recommended = recommended_cost["aggregated_cost"]
        confirmed = confirmed_cost["aggregated_cost"]
        return {
            key: round(confirmed.get(key, 0.0) - recommended.get(key, 0.0), 2)
            for key in sorted(set(recommended) | set(confirmed))
        }

    @staticmethod
    def _context_snapshot(context: dict[str, Any]) -> dict[str, Any]:
        """확정 시점의 merge된 운영 컨텍스트를 SQLite에 저장할 형태로 정규화한다."""
        return {
            "visible": {
                "lineId": context.get("line_id", "LINE-01"),
                "shift": context.get("shift", "day"),
                "crewSize": context.get("crew_size", 3),
            },
            "resolved": {
                "workerSkill": context.get("worker_skill", 0.6),
                "equipmentCondition": context.get("equipment_condition", 0.7),
                "daysSinceLastClean": context.get("days_since_last_clean", 2),
                "dayOfWeek": context.get("day_of_week", 0),
                "contextVersion": context.get("context_version", "context-v1"),
            },
        }
