"""생산순서 평가(SequenceEvaluator) 및 최적화(Optimizer) 서비스."""

import logging
from itertools import permutations
from typing import Any

_log = logging.getLogger(__name__)

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
        """주어진 plan_item_id 순서에 대해 전환 비용과 규칙 페널티를 집계한다.

        인접 plan item 쌍마다 CostPredictor와 RuleEngine을 호출해
        objectiveScore = totalWeightedCost + sequencePenalty를 계산한다.

        Args:
            plan_id: 평가할 생산 계획 식별자.
            sequence: plan_item_id 배열 (평가 순서 기준).
            priority_profile: 비용 차원별 가중치 설정. None이면 NORMAL 기본값 적용.

        Returns:
            sequence, transition_costs, aggregated_cost, objective_score 등을 포함한 평가 결과 딕셔너리.
        """
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
        """추천 순서와 현재 순서의 objectiveScore를 비교해 차이 지표를 반환한다.

        두 순서를 각각 evaluate()한 뒤 recommended를 baseline으로 삼아 diff를 계산한다.
        diff가 양수면 현재 순서가 추천안보다 비용이 높음을 의미한다.

        Args:
            plan_id: 비교 대상 생산 계획 식별자.
            recommended_sequence: 기준(추천) 순서 plan_item_id 배열.
            current_sequence: 사용자가 편집한 현재 순서 plan_item_id 배열.
            priority_profile: 비용 차원별 가중치 설정.

        Returns:
            current_evaluation, baseline_evaluation, comparison_state, comparison_summary를 포함한 딕셔너리.
        """
        baseline = self.evaluate(plan_id, recommended_sequence, priority_profile)
        current = self.evaluate(plan_id, current_sequence, priority_profile)
        recommended_score = baseline["objective_score"]
        current_score = current["objective_score"]
        delta = round(current_score - recommended_score, 2)
        diff_rate = round(delta / recommended_score, 4) if recommended_score else 0.0
        comparison_state = {
            "basis": "objectiveScore",
            "recommended": recommended_score,
            "current": current_score,
            "diff": delta,
            "diff_rate": diff_rate,
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

    SCORE_SCALE = 100

    def __init__(self) -> None:
        self.evaluator = SequenceEvaluator()
        self.loader = self.evaluator.loader
        self.predictor = self.evaluator.predictor
        self.rule_engine = self.evaluator.rule_engine
        self.ortools_available = self._check_ortools()

    def optimize(
        self,
        plan_id: str,
        plan_item_ids: list[str],
        priority_profile: dict | None,
    ) -> dict[str, Any]:
        """objectiveScore를 최소화하는 생산순서를 탐색한다.

        OR-tools 라우팅 솔버를 우선 시도하고, 실패하면 항목 수에 따라
        brute-force(≤8개) 또는 nearest-neighbor(>8개)로 fallback한다.

        Args:
            plan_id: 최적화할 생산 계획 식별자.
            plan_item_ids: 순서를 결정할 plan_item_id 목록.
            priority_profile: 비용 차원별 가중치 설정.

        Returns:
            recommended_sequence, transition_costs, objective_score, optimizer_backend 등을 포함한 딕셔너리.
        """
        if len(plan_item_ids) <= 1:
            sequence = plan_item_ids
        else:
            sequence = self._ortools_sequence(plan_id, plan_item_ids, priority_profile)
            if sequence is None:
                sequence = self._fallback_sequence(plan_id, plan_item_ids, priority_profile)

        evaluation = self.evaluator.evaluate(plan_id, sequence, priority_profile)
        optimizer_backend = self._backend_label(len(plan_item_ids), sequence)
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
            "optimizer_backend": optimizer_backend,
        }

    def _backend_label(self, item_count: int, sequence: list[str]) -> str:
        if item_count <= 1:
            return "trivial"
        if self.ortools_available and getattr(self, "_last_ortools_sequence", None) == sequence:
            return "ortools-routing-open-path"
        if item_count <= 8:
            return "brute-force-fallback"
        return "nearest-neighbor-fallback"

    def _fallback_sequence(
        self,
        plan_id: str,
        plan_item_ids: list[str],
        priority_profile: dict | None,
    ) -> list[str]:
        if len(plan_item_ids) <= 8:
            return self._brute_force(plan_id, plan_item_ids, priority_profile)
        return self._nearest_neighbor(plan_id, plan_item_ids, priority_profile)

    def _ortools_sequence(
        self,
        plan_id: str,
        plan_item_ids: list[str],
        priority_profile: dict | None,
    ) -> list[str] | None:
        self._last_ortools_sequence = None
        if not self.ortools_available:
            return None

        try:
            score_matrix = self._build_score_matrix(plan_id, plan_item_ids, priority_profile)
            ordered_indices = self._solve_open_path(score_matrix)
        except Exception as exc:
            _log.warning("OR-tools sequence failed: %s", exc)
            return None

        if ordered_indices is None:
            return None

        sequence = [plan_item_ids[index] for index in ordered_indices]
        if sorted(sequence) != sorted(plan_item_ids) or len(sequence) != len(plan_item_ids):
            return None

        self._last_ortools_sequence = sequence
        return sequence

    def _build_score_matrix(
        self,
        plan_id: str,
        plan_item_ids: list[str],
        priority_profile: dict | None,
    ) -> list[list[int]]:
        plan_item_map = self.loader.get_plan_item_map(plan_id)
        context = self.loader.get_plan_context(plan_id)
        _, applied_weights = normalize_priority_profile(priority_profile)
        matrix: list[list[int]] = []

        for from_id in plan_item_ids:
            from_item = plan_item_map[from_id]
            row = []
            for to_id in plan_item_ids:
                if from_id == to_id:
                    row.append(0)
                    continue

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
                total_weighted_cost = sum(
                    float(cost_dimensions[dimension]) * applied_weights[dimension]
                    for dimension in COST_DIMENSIONS
                )
                objective_score = total_weighted_cost + float(rule_result["penalty"])
                row.append(max(0, int(round(objective_score * self.SCORE_SCALE))))
            matrix.append(row)

        return matrix

    @staticmethod
    def _solve_open_path(score_matrix: list[list[int]], time_limit_sec: float = 5.0) -> list[int] | None:
        from ortools.constraint_solver import routing_enums_pb2, pywrapcp

        item_count = len(score_matrix)
        dummy = item_count
        node_count = item_count + 1
        manager = pywrapcp.RoutingIndexManager(node_count, 1, dummy)
        routing = pywrapcp.RoutingModel(manager)

        def arc_cost(from_index: int, to_index: int) -> int:
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            if from_node == dummy or to_node == dummy:
                return 0
            return score_matrix[from_node][to_node]

        transit_callback_index = routing.RegisterTransitCallback(arc_cost)
        routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        )
        search_parameters.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        )
        search_parameters.time_limit.FromMilliseconds(max(1, int(time_limit_sec * 1000)))

        solution = routing.SolveWithParameters(search_parameters)
        if solution is None:
            return None

        ordered_indices = []
        index = routing.Start(0)
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node != dummy:
                ordered_indices.append(node)
            index = solution.Value(routing.NextVar(index))

        if sorted(ordered_indices) != list(range(item_count)):
            return None
        return ordered_indices

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
            from ortools.constraint_solver import pywrapcp  # noqa: F401

            return True
        except Exception:
            return False
