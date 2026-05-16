from typing import Any


class ExplanationService:
    """Generates Korean template explanations without calling an external LLM."""

    def explain(self, payload: dict[str, Any]) -> str:
        warnings = payload.get("risk_warnings", [])
        comparison = payload.get("comparison_state", {})
        priority = payload.get("priority_profile", {})

        lines = []
        objective_delta = comparison.get("objective_delta")
        if objective_delta is not None:
            if objective_delta > 0:
                lines.append(f"현재 순서는 추천안보다 목적 점수가 {objective_delta:.2f} 높습니다.")
            elif objective_delta < 0:
                lines.append(f"현재 순서는 추천안보다 목적 점수가 {abs(objective_delta):.2f} 낮습니다.")
            else:
                lines.append("현재 순서는 추천안과 목적 점수가 동일합니다.")

        high_warning = next((warning for warning in warnings if warning.get("severity") == "HIGH"), None)
        if high_warning:
            lines.append(high_warning["message"])
        elif warnings:
            lines.append("일부 색상 전환 구간에서 세척 확인이 필요한 warning이 감지되었습니다.")

        wash_priority = priority.get("wash_cost", {})
        wash_label = wash_priority.get("label") if isinstance(wash_priority, dict) else wash_priority
        if wash_label in {"HIGH", "VERY_HIGH"}:
            lines.append("세척 비용 우선순위가 높게 설정되어 유사 색상군을 연속 배치하는 방향이 유리합니다.")

        if not lines:
            lines.append("현재 순서는 큰 색상 전환 리스크 없이 안정적인 기준으로 평가되었습니다.")
        return " ".join(lines)
