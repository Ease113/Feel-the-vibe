"""운영 컨텍스트 균일 배수의 회귀 테스트.

docs/design/operating-context-cost-multiplier.md Decision 1·4를 잠근다:
shift/crew_size 변경은 6개 비용 차원 전체에 동일 비율로만 적용되어
추천 순서 순위는 변하지 않고 절대 비용만 변동해야 한다. heuristic 경로의
결정론을 이용해 비율을 정확히 검증한다.
"""

from __future__ import annotations

import pytest

from app.ml import model_registry
from app.services.cost_predictor import (
    CREW_BASELINE,
    CREW_PER_PERSON_DELTA,
    NIGHT_SHIFT_MULTIPLIER,
    CostPredictor,
    _operating_context_multiplier,
)


FROM_ITEM = {
    "sku": {
        "color_family": "white",
        "pigment_intensity": 0.1,
        "gloss_level": 0.8,
        "viscosity": 0.3,
        "category": "light",
    },
    "package_size": "4L",
}
TO_ITEM = {
    "sku": {
        "color_family": "black",
        "pigment_intensity": 0.9,
        "gloss_level": 0.3,
        "viscosity": 0.55,
        "category": "dark",
    },
    "package_size": "4L",
}
BASE_CONTEXT = {
    "worker_skill": 0.6,
    "crew_size": CREW_BASELINE,
    "days_since_last_clean": 2,
    "equipment_condition": 0.7,
    "day_of_week": 4,
    "shift": "day",
}


def _with(context: dict, **overrides) -> dict:
    return {**context, **overrides}


def test_multiplier_helper_combines_shift_and_crew() -> None:
    """`_operating_context_multiplier`가 shift × crew_delta로 곱셈 합성된다."""
    assert _operating_context_multiplier({"shift": "day", "crew_size": CREW_BASELINE}) == pytest.approx(1.0)
    assert _operating_context_multiplier({"shift": "night", "crew_size": CREW_BASELINE}) == pytest.approx(
        NIGHT_SHIFT_MULTIPLIER
    )
    assert _operating_context_multiplier({"shift": "day", "crew_size": CREW_BASELINE + 2}) == pytest.approx(
        1.0 + 2 * CREW_PER_PERSON_DELTA
    )
    assert _operating_context_multiplier({"shift": "night", "crew_size": CREW_BASELINE + 2}) == pytest.approx(
        NIGHT_SHIFT_MULTIPLIER * (1.0 + 2 * CREW_PER_PERSON_DELTA)
    )


def test_multiplier_clamps_pathological_input() -> None:
    """비현실적 crew_size로 배수가 0 이하가 되어도 0.1로 클램프된다."""
    huge_negative = {"shift": "day", "crew_size": -50}
    assert _operating_context_multiplier(huge_negative) >= 0.1


def test_heuristic_predict_scales_uniformly_by_shift() -> None:
    """heuristic 경로에서 shift=night은 6개 차원 모두 정확히 ×NIGHT_SHIFT_MULTIPLIER."""
    model_registry.load_models(force_reload=True)  # 임시 모델 디렉토리 비움 보장
    predictor = CostPredictor.heuristic_only()

    day = predictor.predict_transition(FROM_ITEM, TO_ITEM, _with(BASE_CONTEXT, shift="day"))
    night = predictor.predict_transition(FROM_ITEM, TO_ITEM, _with(BASE_CONTEXT, shift="night"))

    for dim in day:
        assert night[dim] == round(day[dim] * NIGHT_SHIFT_MULTIPLIER, 2), (
            f"{dim}: day={day[dim]} night={night[dim]} expected={round(day[dim] * NIGHT_SHIFT_MULTIPLIER, 2)}"
        )


def test_heuristic_predict_scales_uniformly_by_crew() -> None:
    """heuristic 경로에서 crew_size 변경도 균일 배수로만 반영된다."""
    predictor = CostPredictor.heuristic_only()

    baseline = predictor.predict_transition(FROM_ITEM, TO_ITEM, _with(BASE_CONTEXT, crew_size=CREW_BASELINE))
    enlarged = predictor.predict_transition(FROM_ITEM, TO_ITEM, _with(BASE_CONTEXT, crew_size=CREW_BASELINE + 2))

    expected_ratio = 1.0 + 2 * CREW_PER_PERSON_DELTA
    for dim in baseline:
        assert enlarged[dim] == round(baseline[dim] * expected_ratio, 2), (
            f"{dim}: baseline={baseline[dim]} enlarged={enlarged[dim]}"
        )


def test_heuristic_predict_compose_shift_and_crew() -> None:
    """shift+crew 동시 변경은 두 배수의 곱과 같아야 한다."""
    predictor = CostPredictor.heuristic_only()

    baseline = predictor.predict_transition(FROM_ITEM, TO_ITEM, _with(BASE_CONTEXT, shift="day", crew_size=CREW_BASELINE))
    combined = predictor.predict_transition(
        FROM_ITEM, TO_ITEM, _with(BASE_CONTEXT, shift="night", crew_size=CREW_BASELINE + 2)
    )

    expected_ratio = NIGHT_SHIFT_MULTIPLIER * (1.0 + 2 * CREW_PER_PERSON_DELTA)
    for dim in baseline:
        assert combined[dim] == round(baseline[dim] * expected_ratio, 2), (
            f"{dim}: baseline={baseline[dim]} combined={combined[dim]}"
        )


def test_heuristic_predict_baseline_ignores_crew_in_labor() -> None:
    """`_predict_heuristic`의 labor_cost는 CREW_BASELINE으로 고정되어,
    동일 shift에서 crew_size를 바꿔도 multiplier 이외의 경로로 비용이 흔들리지 않는다.
    """
    predictor = CostPredictor.heuristic_only()

    # crew_size 변경분이 배수로만 반영됨을 확인: predict(crew=5) / predict(crew=3) 비율이
    # labor_cost와 다른 5개 차원에서 모두 동일해야 한다.
    base = predictor.predict_transition(FROM_ITEM, TO_ITEM, _with(BASE_CONTEXT, crew_size=CREW_BASELINE))
    other = predictor.predict_transition(FROM_ITEM, TO_ITEM, _with(BASE_CONTEXT, crew_size=CREW_BASELINE + 1))

    ratios = [other[dim] / base[dim] for dim in base if base[dim] > 0]
    expected = 1.0 + CREW_PER_PERSON_DELTA
    for ratio in ratios:
        assert ratio == pytest.approx(expected, abs=0.005)
