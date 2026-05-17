from typing import Any

from app.core.config import RULE_VERSION
from app.services.data_loader import DataLoader


class RuleEngine:
    """Evaluates MVP color-transition risk rules from sequence_rules.json."""

    rule_version = RULE_VERSION

    def __init__(self) -> None:
        payload = DataLoader().get_rules()
        self.rule_version = payload.get("rule_version", RULE_VERSION)
        self.rules = sorted(
            payload.get("rules", []),
            key=self._specificity,
            reverse=True,
        )

    def evaluate_transition(
        self,
        from_sku: dict[str, Any],
        to_sku: dict[str, Any],
        from_plan_item_id: str,
        to_plan_item_id: str,
    ) -> dict[str, Any]:
        for rule in self.rules:
            if self._matches(rule, from_sku, to_sku):
                return self._rule_result(rule, from_plan_item_id, to_plan_item_id)

        return self._result(None, None, 0.0, from_plan_item_id, to_plan_item_id, "")

    @staticmethod
    def _matches(rule: dict[str, Any], from_sku: dict[str, Any], to_sku: dict[str, Any]) -> bool:
        checks = [
            ("from_sku_id", from_sku.get("sku_id")),
            ("to_sku_id", to_sku.get("sku_id")),
            ("from_category", from_sku.get("category")),
            ("to_category", to_sku.get("category")),
        ]
        for key, actual in checks:
            expected = rule.get(key)
            if expected is not None and expected != actual:
                return False

        if not _matches_in(rule.get("from_category_in"), from_sku.get("category")):
            return False
        if not _matches_in(rule.get("to_category_in"), to_sku.get("category")):
            return False
        return True

    @staticmethod
    def _specificity(rule: dict[str, Any]) -> int:
        score = 0
        for key in [
            "from_sku_id",
            "to_sku_id",
            "from_category",
            "to_category",
            "from_category_in",
            "to_category_in",
        ]:
            if rule.get(key) is not None:
                score += 1
        if rule.get("from_sku_id") is not None or rule.get("to_sku_id") is not None:
            score += 10
        return score

    def _rule_result(
        self,
        rule: dict[str, Any],
        from_plan_item_id: str,
        to_plan_item_id: str,
    ) -> dict[str, Any]:
        severity = _risk_to_severity(rule.get("risk"))
        return self._result(
            rule["rule_id"],
            severity,
            float(rule["penalty"]),
            from_plan_item_id,
            to_plan_item_id,
            rule.get("reason", ""),
            rule.get("recommendation"),
        )

    @staticmethod
    def _result(
        rule_id: str | None,
        severity: str | None,
        penalty: float,
        from_plan_item_id: str,
        to_plan_item_id: str,
        message: str,
        recommendation: str | None = None,
    ) -> dict[str, Any]:
        warning = None
        if message:
            warning = {
                "rule_id": rule_id,
                "severity": severity,
                "from_plan_item_id": from_plan_item_id,
                "to_plan_item_id": to_plan_item_id,
                "penalty": penalty,
                "message": message,
                "recommendation": recommendation,
            }
        # no-rule baseline은 1.0, 매칭 룰의 severity 점수는 LOW/MEDIUM/HIGH 매핑
        risk_score = {"LOW": 1.0, "MEDIUM": 18.0, "HIGH": 35.0}.get(severity, 1.0)
        return {
            "rule_id": rule_id,
            "severity": severity,
            "penalty": penalty,
            "sequence_risk": risk_score,
            "warning": warning,
        }


def _matches_in(expected_values: Any, actual: str | None) -> bool:
    if expected_values is None:
        return True
    return actual in expected_values


def _risk_to_severity(risk: str | None) -> str:
    return {
        "high": "HIGH",
        "mid": "MEDIUM",
        "low": "LOW",
    }.get(risk or "low", "LOW")
