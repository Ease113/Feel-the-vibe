"""비용 차원 목록과 우선순위 프로파일 정규화 유틸리티."""

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
    """모든 비용 차원을 NORMAL(multiplier=1.0)으로 설정한 기본 프로파일을 반환한다."""
    return {
        dimension: {"label": "NORMAL", "multiplier": PRIORITY_MULTIPLIERS["NORMAL"]}
        for dimension in COST_DIMENSIONS
    }


def normalize_priority_profile(profile: dict | None) -> tuple[dict, dict[str, float]]:
    """입력 프로파일을 정규화해 (normalized_profile, applied_weights) 튜플을 반환한다.

    입력값은 str("HIGH"), dict({"label":"HIGH"}), 또는 None을 지원한다.
    알 수 없는 label은 NORMAL로 처리한다.

    Args:
        profile: 비용 차원별 우선순위 설정. None이면 전 차원 NORMAL 반환.

    Returns:
        (label/multiplier 구조의 정규화 딕셔너리, 차원별 float 가중치 딕셔너리) 튜플.
    """
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
