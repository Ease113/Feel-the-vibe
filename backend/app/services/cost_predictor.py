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
        from_sku = from_item["sku"]
        to_sku = to_item["sku"]
        brightness_gap = abs(float(from_sku["brightness_level"]) - float(to_sku["brightness_level"]))
        viscosity_gap = abs(float(from_sku["viscosity_level"]) - float(to_sku["viscosity_level"]))
        package_changed = from_item["package_size"] != to_item["package_size"]
        family_changed = from_sku["color_family"] != to_sku["color_family"]
        metallic_change = int(from_sku["is_metallic"]) != int(to_sku["is_metallic"])

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
