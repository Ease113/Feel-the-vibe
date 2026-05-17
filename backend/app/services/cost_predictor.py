"""색상 전환 비용을 예측하는 휴리스틱 비용 예측기."""

from typing import Any

from app.core.config import MODEL_VERSION


class CostPredictor:
    """Predicts six transition cost dimensions with a safe heuristic fallback."""

    def __init__(self) -> None:
        self.model_version = MODEL_VERSION
        self.uses_model = False
        try:
            import xgboost  # noqa: F401

            self.uses_model = False
        except Exception:
            self.uses_model = False

    def predict_transition(
        self,
        from_item: dict[str, Any],
        to_item: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, float]:
        """두 plan item 사이의 6개 비용 차원을 휴리스틱으로 예측한다.

        밝기·점도 차이, 포장 변경, 색상군 전환, 메탈릭 여부, 설비 상태, 작업자 숙련도를
        복합 가중치로 합산해 complexity를 계산한다. XGBoost 모델은 아직 미연동이므로
        heuristic이 primary path다.

        Args:
            from_item: 직전 생산 plan item (sku 키 포함).
            to_item: 다음 생산 plan item (sku 키 포함).
            context: 라인 컨텍스트 (crew_size, worker_skill, equipment_condition 등).

        Returns:
            setup_time, labor_cost, material_loss, wash_cost, downtime,
            packaging_time 6개 키를 가진 비용 딕셔너리 (단위: 분/원/L).
        """
        from_sku = from_item["sku"]
        to_sku = to_item["sku"]
        brightness_gap = abs(_brightness_level(from_sku) - _brightness_level(to_sku))
        viscosity_gap = abs(_viscosity_level(from_sku) - _viscosity_level(to_sku))
        package_changed = from_item["package_size"] != to_item["package_size"]
        family_changed = from_sku["color_family"] != to_sku["color_family"]
        metallic_change = _is_metallic(from_sku) != _is_metallic(to_sku)

        complexity = 1.0
        complexity += brightness_gap / 75.0
        complexity += viscosity_gap / 120.0
        complexity += 0.25 if package_changed else 0.0
        complexity += 0.35 if family_changed else 0.0
        complexity += 0.45 if metallic_change else 0.0
        complexity += float(context.get("days_since_last_clean", 2)) * 0.03
        complexity += (1.0 - float(context.get("equipment_condition", 0.7))) * 0.25
        complexity -= float(context.get("worker_skill", 0.6)) * 0.12

        setup_time = max(6.0, 11.0 * complexity)
        downtime = max(3.0, 5.0 * complexity)
        packaging_time = 5.0 + (5.0 if package_changed else 1.2) + complexity
        material_loss = max(0.5, 1.2 * complexity + brightness_gap / 90.0)
        wash_cost = 14000.0 * complexity + (6500.0 if family_changed else 1500.0)
        labor_cost = setup_time * float(context.get("crew_size", 3)) * 850.0

        return {
            "setup_time": round(setup_time, 2),
            "labor_cost": round(labor_cost, 2),
            "material_loss": round(material_loss, 2),
            "wash_cost": round(wash_cost, 2),
            "downtime": round(downtime, 2),
            "packaging_time": round(packaging_time, 2),
        }


def _brightness_level(sku: dict[str, Any]) -> float:
    if "brightness_level" in sku and sku["brightness_level"] not in ("", None):
        return float(sku["brightness_level"])
    return (1.0 - float(sku.get("pigment_intensity", 0.5))) * 100.0


def _viscosity_level(sku: dict[str, Any]) -> float:
    if "viscosity_level" in sku and sku["viscosity_level"] not in ("", None):
        return float(sku["viscosity_level"])
    return float(sku.get("viscosity", 0.5)) * 100.0


def _is_metallic(sku: dict[str, Any]) -> bool:
    if "is_metallic" in sku and sku["is_metallic"] not in ("", None):
        return bool(int(sku["is_metallic"]))
    return sku.get("category") in {"metal", "special"}
