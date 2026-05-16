from typing import Any

from app.core.config import RULE_VERSION


class RuleEngine:
    """Evaluates explicit MVP color-transition risk rules."""

    rule_version = RULE_VERSION

    def evaluate_transition(
        self,
        from_sku: dict[str, Any],
        to_sku: dict[str, Any],
        from_plan_item_id: str,
        to_plan_item_id: str,
    ) -> dict[str, Any]:
        from_family = from_sku["color_family"]
        to_family = to_sku["color_family"]
        from_brightness = int(float(from_sku["brightness_level"]))
        to_brightness = int(float(to_sku["brightness_level"]))
        brightness_gap = to_brightness - from_brightness
        from_metallic = bool(int(from_sku["is_metallic"]))
        to_metallic = bool(int(to_sku["is_metallic"]))

        if from_family == "black" and to_family == "white":
            return self._result(
                "SR-001",
                "HIGH",
                80.0,
                from_plan_item_id,
                to_plan_item_id,
                "검정에서 흰색으로 전환되는 구간이 있어 세척 리스크가 높습니다.",
            )

        if from_brightness < 35 and to_brightness > 70:
            severity = "HIGH" if brightness_gap >= 55 else "MEDIUM"
            penalty = 55.0 if severity == "HIGH" else 35.0
            return self._result(
                "SR-002",
                severity,
                penalty,
                from_plan_item_id,
                to_plan_item_id,
                "어두운 색상에서 밝은 색상으로 전환되어 잔색 리스크가 감지되었습니다.",
            )

        if from_metallic and not to_metallic:
            return self._result(
                "SR-003",
                "MEDIUM",
                32.0,
                from_plan_item_id,
                to_plan_item_id,
                "메탈릭 제품 이후 일반 제품으로 전환되어 세척 확인이 필요합니다.",
            )

        if from_sku["sku_id"] == to_sku["sku_id"] or from_family == to_family:
            return self._result("SR-004", "LOW", 0.0, from_plan_item_id, to_plan_item_id, "")

        return self._result("SR-000", "LOW", 8.0, from_plan_item_id, to_plan_item_id, "")

    @staticmethod
    def _result(
        rule_id: str,
        severity: str,
        penalty: float,
        from_plan_item_id: str,
        to_plan_item_id: str,
        message: str,
    ) -> dict[str, Any]:
        warning = None
        if message:
            warning = {
                "rule_id": rule_id,
                "severity": severity,
                "from_plan_item_id": from_plan_item_id,
                "to_plan_item_id": to_plan_item_id,
                "message": message,
            }
        risk_score = {"LOW": 4.0, "MEDIUM": 18.0, "HIGH": 35.0}.get(severity, 4.0)
        if rule_id == "SR-004":
            risk_score = 1.0
        return {
            "rule_id": rule_id,
            "severity": severity,
            "penalty": penalty,
            "sequence_risk": risk_score,
            "warning": warning,
        }
