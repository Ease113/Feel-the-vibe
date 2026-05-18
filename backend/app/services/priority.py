"""비용 차원 목록, 공장 기본 가중치, 그리고 우선순위 프로파일 정규화 유틸리티.

contract (`docs/source/DB_state_v1.3.md` §6.1-6.2, `docs/api_contract.md` §29-77) 기준으로
`priority_profile`은 nested 형식 ``{base_weight_profile_id, priorities: {dim: {label, multiplier}}}``
이며, `applied_weights`는 공장 기본 가중치에 multiplier를 적용한 뒤 합=1로 재정규화된 6차원이다.
``sequence_risk``는 Rule Engine 산출이라 priority 가중치 대상이 아니다.
"""

# 7개 비용 차원 (display + aggregation). sequence_risk 포함.
COST_DIMENSIONS = [
    "setup_time",
    "labor_cost",
    "material_loss",
    "wash_cost",
    "downtime",
    "sequence_risk",
    "packaging_time",
]

# applied_weights / total_weighted_cost 적용 대상 6차원. sequence_risk 제외.
BASE_WEIGHT_DIMENSIONS = [
    "setup_time",
    "wash_cost",
    "downtime",
    "material_loss",
    "packaging_time",
    "labor_cost",
]

# 운영자가 UI 슬라이더로 조절하는 5차원. setup_time은 서버 고정, sequence_risk는 priority 대상 아님.
OPERATOR_PRIORITY_DIMENSIONS = [
    "wash_cost",
    "downtime",
    "material_loss",
    "packaging_time",
    "labor_cost",
]

PRIORITY_MULTIPLIERS = {
    "VERY_LOW": 0.70,
    "LOW": 0.85,
    "NORMAL": 1.00,
    "HIGH": 1.15,
    "VERY_HIGH": 1.30,
}

FACTORY_DEFAULT_V1_PROFILE_ID = "factory_default_v1"

# api_contract.md §6.2 예시 applied_weights에서 역산한 공장 기본 가중치. 합 = 1.000.
FACTORY_DEFAULT_V1_BASE_WEIGHTS = {
    "setup_time": 0.1360,
    "wash_cost": 0.2047,
    "downtime": 0.2354,
    "material_loss": 0.1360,
    "packaging_time": 0.1063,
    "labor_cost": 0.1816,
}


def default_priority_profile() -> dict:
    """Contract 형식의 기본 priority_profile을 반환한다.

    5개 운영자 차원만 NORMAL(multiplier=1.0)으로 채운 nested 구조다.
    setup_time과 sequence_risk는 priorities에 포함하지 않는다.

    Returns:
        ``{"base_weight_profile_id": ..., "priorities": {dim: {label, multiplier}}}``.
    """
    return {
        "base_weight_profile_id": FACTORY_DEFAULT_V1_PROFILE_ID,
        "priorities": {
            dim: {"label": "NORMAL", "multiplier": PRIORITY_MULTIPLIERS["NORMAL"]}
            for dim in OPERATOR_PRIORITY_DIMENSIONS
        },
    }


def normalize_priority_profile(profile: dict | None) -> tuple[dict, dict[str, float]]:
    """priority_profile을 contract 형식으로 정규화하고 applied_weights를 계산한다.

    입력은 세 가지 형태를 모두 graceful하게 수용한다:
      - nested contract: ``{"base_weight_profile_id": str, "priorities": {dim: {"label", "multiplier"}}}``
      - flat legacy: ``{dim: {"label", ...} | str | None}``
      - ``None`` 또는 빈 dict: 전 차원 NORMAL.

    출력 priority_profile은 항상 nested 정본 형식. ``applied_weights``는
    ``BASE_WEIGHT_DIMENSIONS`` 6차원만 포함하고 합이 1로 재정규화된다 (sequence_risk 제외).
    공장 기본 가중치는 ``FACTORY_DEFAULT_V1_BASE_WEIGHTS``를 사용하며 setup_time의 multiplier는
    1.0으로 고정한다 (운영자 미조절).

    Args:
        profile: 비용 차원별 우선순위 설정. ``None`` 또는 빈 dict면 전 차원 NORMAL.

    Returns:
        (정규화된 nested priority_profile, 차원별 float 가중치 dict) 튜플.
    """
    priorities_in = _extract_priorities(profile)
    base_profile_id = (
        profile.get("base_weight_profile_id", FACTORY_DEFAULT_V1_PROFILE_ID)
        if isinstance(profile, dict)
        else FACTORY_DEFAULT_V1_PROFILE_ID
    )

    normalized_priorities = {
        dim: {"label": "NORMAL", "multiplier": PRIORITY_MULTIPLIERS["NORMAL"]}
        for dim in OPERATOR_PRIORITY_DIMENSIONS
    }
    for dim in OPERATOR_PRIORITY_DIMENSIONS:
        value = priorities_in.get(dim)
        if value is None:
            continue
        label = _resolve_label(value)
        normalized_priorities[dim] = {
            "label": label,
            "multiplier": PRIORITY_MULTIPLIERS[label],
        }

    raw_weights = {}
    for dim in BASE_WEIGHT_DIMENSIONS:
        # setup_time은 운영자 조절 대상이 아니므로 multiplier=1.0 고정.
        setting = normalized_priorities.get(dim)
        multiplier = setting["multiplier"] if setting else 1.0
        raw_weights[dim] = FACTORY_DEFAULT_V1_BASE_WEIGHTS[dim] * multiplier

    total = sum(raw_weights.values())
    applied_weights = {
        dim: round(raw_weights[dim] / total, 4) if total else 0.0
        for dim in BASE_WEIGHT_DIMENSIONS
    }

    return (
        {
            "base_weight_profile_id": base_profile_id,
            "priorities": normalized_priorities,
        },
        applied_weights,
    )


def _extract_priorities(profile: dict | None) -> dict:
    """Nested 또는 flat 입력에서 priorities dict를 추출한다.

    Args:
        profile: 호출자가 전달한 임의 dict (또는 None).

    Returns:
        dimension → setting 매핑 dict. 입력이 비었으면 빈 dict.
    """
    if not profile or not isinstance(profile, dict):
        return {}
    if "priorities" in profile:
        priorities = profile.get("priorities") or {}
        return priorities if isinstance(priorities, dict) else {}
    return profile


def _resolve_label(value: object) -> str:
    """문자열 또는 dict 입력에서 PriorityLabel을 추출, 알 수 없으면 NORMAL fallback.

    Args:
        value: 라벨 문자열 ``"HIGH"`` 또는 ``{"label": "HIGH", ...}`` 형태.

    Returns:
        ``PRIORITY_MULTIPLIERS`` 키 중 하나.
    """
    if isinstance(value, str):
        label = value.upper()
    elif isinstance(value, dict):
        label = str(value.get("label", "NORMAL")).upper()
    else:
        label = "NORMAL"
    return label if label in PRIORITY_MULTIPLIERS else "NORMAL"
