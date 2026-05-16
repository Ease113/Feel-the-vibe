from itertools import permutations
from typing import Any

from app.core.config import MODEL_VERSION, RULE_VERSION
from app.services.cost_predictor import CostPredictor
from app.services.data_loader import DataLoader
from app.services.priority import COST_DIMENSIONS, normalize_priority_profile
from app.services.rule_engine import RuleEngine


class SequenceEvaluator:
    """Evaluates a plan_item_id sequence with cost prediction and rule penalties."""

    def __init__(self) -> None:
        self.loader = DataLoader()
        self.predictor = CostPredictor()
        self.rule_engine = RuleEngine()

    def evaluate(
        self,
        plan_id: str,
        sequence: list[str],
        priority_profile: dict | None,
    ) -> dict[str, Any]:
        plan_item_map = self.loader.get_plan_item_map(plan_id)
        context = self.loader.get_plan_context(plan_id)
        normalized_priority, applied_weights = normalize_priority_profile(priority_profile)
        aggregated = {dimension: 0.0 for dimension in COST_DIMENSIONS}
        transition_costs = []
        risk_warnings = []
        sequence_penalty = 0.0

        for from_id, to_id in zip(sequence, sequence[1:]):
            from_item = plan_item_map[from_id]
            to_item = plan_item_map[to_id]
            costs = self.predictor.predict_transition(from_item, to_item, context)
            rule_result = self.rule_engine.evaluate_transition(
                from_item["sku"],
                to_item["sku"],
                from_id,
                to_id,
            )
            cost_dimensions = {
                **costs,
                "sequence_risk": rule_result["sequence_risk"],
            }
            for dimension, value in cost_dimensions.items():
                aggregated[dimension] += float(value)
            sequence_penalty += float(rule_result["penalty"])
            if rule_result["warning"]:
                risk_warnings.append(rule_result["warning"])

            transition_costs.append(
                {
                    "from_plan_item_id": from_id,
                    "to_plan_item_id": to_id,
                    "from_sku_id": from_item["sku_id"],
                    "to_sku_id": to_item["sku_id"],
                    "cost_dimensions": cost_dimensions,
                    "rule_id": rule_result["rule_id"],
                    "severity": rule_result["severity"],
                    "sequence_penalty": rule_result["penalty"],
                    "warning": rule_result["warning"],
                }
            )

        aggregated = {key: round(value, 2) for key, value in aggregated.items()}
        total_weighted_cost = sum(
            aggregated[dimension] * applied_weights[dimension]
            for dimension in COST_DIMENSIONS
        )
        objective_score = total_weighted_cost + sequence_penalty

        return {
            "sequence": sequence,
            "transition_costs": transition_costs,
            "aggregated_cost": aggregated,
            "total_weighted_cost": round(total_weighted_cost, 2),
            "sequence_penalty": round(sequence_penalty, 2),
            "objective_score": round(objective_score, 2),
            "risk_warnings": risk_warnings,
            "priority_profile": normalized_priority,
            "applied_weights": applied_weights,
            "model_version": MODEL_VERSION,
            "rule_version": RULE_VERSION,
        }

    def compare(
        self,
        plan_id: str,
        recommended_sequence: list[str],
        current_sequence: list[str],
        priority_profile: dict | None,
    ) -> dict[str, Any]:
        baseline = self.evaluate(plan_id, recommended_sequence, priority_profile)
        current = self.evaluate(plan_id, current_sequence, priority_profile)
        delta = round(current["objective_score"] - baseline["objective_score"], 2)
        comparison_state = {
            "objective_delta": delta,
            "total_weighted_cost_delta": round(
                current["total_weighted_cost"] - baseline["total_weighted_cost"], 2
            ),
            "sequence_penalty_delta": round(
                current["sequence_penalty"] - baseline["sequence_penalty"], 2
            ),
            "risk_warning_delta": len(current["risk_warnings"]) - len(baseline["risk_warnings"]),
            "is_better_than_baseline": delta < 0,
        }
        if delta == 0:
            summary = "현재 순서는 추천안과 동일한 목적 점수입니다."
        elif delta < 0:
            summary = f"현재 순서는 추천안보다 목적 점수가 {abs(delta):.2f} 낮습니다."
        else:
            summary = f"현재 순서는 추천안보다 목적 점수가 {delta:.2f} 높습니다."

        return {
            "current_evaluation": current,
            "baseline_evaluation": baseline,
            "comparison_state": comparison_state,
            "comparison_summary": summary,
            "applied_weights": current["applied_weights"],
        }


class Optimizer:
    """Optimizes production sequence and falls back to brute force for demo plans."""

    def __init__(self) -> None:
        self.evaluator = SequenceEvaluator()
        self.ortools_available = self._check_ortools()

    def optimize(
        self,
        plan_id: str,
        plan_item_ids: list[str],
        priority_profile: dict | None,
    ) -> dict[str, Any]:
        if len(plan_item_ids) <= 1:
            sequence = plan_item_ids
        elif len(plan_item_ids) <= 8:
            sequence = self._brute_force(plan_id, plan_item_ids, priority_profile)
        else:
            sequence = self._nearest_neighbor(plan_id, plan_item_ids, priority_profile)

        evaluation = self.evaluator.evaluate(plan_id, sequence, priority_profile)
        return {
            "recommended_sequence": sequence,
            "transition_costs": evaluation["transition_costs"],
            "aggregated_cost": evaluation["aggregated_cost"],
            "total_weighted_cost": evaluation["total_weighted_cost"],
            "sequence_penalty": evaluation["sequence_penalty"],
            "objective_score": evaluation["objective_score"],
            "risk_warnings": evaluation["risk_warnings"],
            "model_version": evaluation["model_version"],
            "rule_version": evaluation["rule_version"],
            "optimizer_backend": (
                "ortools-present-bruteforce-demo"
                if self.ortools_available
                else "brute-force-fallback"
            ),
        }

    def _brute_force(
        self,
        plan_id: str,
        plan_item_ids: list[str],
        priority_profile: dict | None,
    ) -> list[str]:
        best_sequence = list(plan_item_ids)
        best_score = float("inf")
        for candidate in permutations(plan_item_ids):
            evaluation = self.evaluator.evaluate(plan_id, list(candidate), priority_profile)
            if evaluation["objective_score"] < best_score:
                best_score = evaluation["objective_score"]
                best_sequence = list(candidate)
        return best_sequence

    def _nearest_neighbor(
        self,
        plan_id: str,
        plan_item_ids: list[str],
        priority_profile: dict | None,
    ) -> list[str]:
        remaining = set(plan_item_ids)
        sequence = [plan_item_ids[0]]
        remaining.remove(plan_item_ids[0])
        while remaining:
            last = sequence[-1]
            next_id = min(
                remaining,
                key=lambda item_id: self.evaluator.evaluate(
                    plan_id, [last, item_id], priority_profile
                )["objective_score"],
            )
            sequence.append(next_id)
            remaining.remove(next_id)
        return sequence

    @staticmethod
    def _check_ortools() -> bool:
        try:
            import ortools  # noqa: F401

            return True
        except Exception:
            return False
