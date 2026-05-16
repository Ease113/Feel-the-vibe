COST_DIMENSIONS = [
    "setup_time",
    "labor_cost",
    "material_loss",
    "wash_cost",
    "downtime",
    "sequence_risk",
    "packaging_time",
]

PRIORITY_MULTIPLIERS = {
    "VERY_LOW": 0.70,
    "LOW": 0.85,
    "NORMAL": 1.00,
    "HIGH": 1.15,
    "VERY_HIGH": 1.30,
}


def default_priority_profile() -> dict[str, dict[str, float | str]]:
    return {
        dimension: {"label": "NORMAL", "multiplier": PRIORITY_MULTIPLIERS["NORMAL"]}
        for dimension in COST_DIMENSIONS
    }


def normalize_priority_profile(profile: dict | None) -> tuple[dict, dict[str, float]]:
    normalized = default_priority_profile()
    if profile:
        for dimension in COST_DIMENSIONS:
            value = profile.get(dimension)
            if value is None:
                continue
            if isinstance(value, str):
                label = value.upper()
            elif isinstance(value, dict):
                label = str(value.get("label", "NORMAL")).upper()
            else:
                label = "NORMAL"
            multiplier = PRIORITY_MULTIPLIERS.get(label, PRIORITY_MULTIPLIERS["NORMAL"])
            normalized[dimension] = {"label": label, "multiplier": multiplier}

    applied_weights = {
        dimension: float(setting["multiplier"])
        for dimension, setting in normalized.items()
    }
    return normalized, applied_weights
