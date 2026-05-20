"""색상 전환 비용을 예측하는 비용 예측기.

XGBoost 모델이 로드되면 XGBoost 경로를, 아니면 heuristic 경로를 사용한다.
입출력 시그니처는 두 경로에서 동일하며, 단일 예측 실패 시에도 heuristic으로
graceful fallback 한다 (AGENTS.md fallback 정책: "모델 없으면 heuristic").
"""

from __future__ import annotations

import logging
from typing import Any

from app.ml import model_registry
from app.ml.features import build_features_for_transition

_log = logging.getLogger(__name__)


class CostPredictor:
    """Predicts six transition cost dimensions with XGBoost or heuristic fallback."""

    HEURISTIC_VERSION = "heuristic-v1"
    XGBOOST_VERSION = "xgboost-v1"

    def __init__(self, force_heuristic: bool = False) -> None:
        """모델 가용성에 따라 사용할 분기를 결정한다.

        Args:
            force_heuristic: True면 모델이 로드 가능해도 heuristic 경로만 사용한다.
                학습 시 baseline 비교 등 정적 평가용.
        """
        self._models = None if force_heuristic else model_registry.load_models()
        self.model_version = (
            self.XGBOOST_VERSION if self._models is not None else self.HEURISTIC_VERSION
        )

    @classmethod
    def heuristic_only(cls) -> "CostPredictor":
        """학습/검증 baseline용으로 heuristic 경로만 사용하는 인스턴스를 만든다."""
        return cls(force_heuristic=True)

    def predict_transition(
        self,
        from_item: dict[str, Any],
        to_item: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, float]:
        """두 plan item 사이의 6개 비용 차원을 예측한다.

        모델이 로드되어 있으면 XGBoost로 예측하고, 단일 예측 실패 시 heuristic으로
        graceful fallback 한다. 두 경로 모두 같은 6개 키를 가진 dict를 반환한다.

        Args:
            from_item: 직전 생산 plan item (sku 키 포함).
            to_item: 다음 생산 plan item (sku 키 포함).
            context: 라인 컨텍스트 (crew_size, worker_skill, equipment_condition 등).

        Returns:
            setup_time, labor_cost, material_loss, wash_cost, downtime,
            packaging_time 6개 키를 가진 비용 딕셔너리 (단위: 분/원/L).
        """
        if self._models is None:
            return self._predict_heuristic(from_item, to_item, context)
        try:
            return self._predict_xgboost(from_item, to_item, context)
        except Exception as exc:
            _log.warning("XGBoost predict failed, falling back to heuristic: %s", exc)
            return self._predict_heuristic(from_item, to_item, context)

    def _predict_xgboost(
        self,
        from_item: dict[str, Any],
        to_item: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, float]:
        """학습된 XGBoost 모델 6개로 차원별 예측을 수행한다.

        feature DataFrame은 `build_features_for_transition`이 학습 시점과
        동일한 컬럼·순서로 만들어주므로 추가 정렬이 필요 없다. 결과는 음수
        클램프 후 소수 둘째 자리에서 반올림한다.
        """
        import xgboost as xgb

        features_df = build_features_for_transition(from_item, to_item, context)
        dmatrix = xgb.DMatrix(features_df)
        out: dict[str, float] = {}
        assert self._models is not None
        for dim, booster in self._models.items():
            value = float(booster.predict(dmatrix)[0])
            out[dim] = round(max(0.0, value), 2)
        return out

    def _predict_heuristic(
        self,
        from_item: dict[str, Any],
        to_item: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, float]:
        """Deterministic heuristic 경로. fallback이자 baseline 비교용.

        밝기·점도·광택 차이, 포장 변경, 색상군 전환, 메탈릭 여부, 설비 상태,
        작업자 숙련도를 복합 가중치로 합산해 complexity를 계산한다. 광택 차이는
        세척 부담의 직접 신호이므로 complexity 전파에 더해 wash_cost에도 별도로
        가산한다.
        """
        from_sku = from_item["sku"]
        to_sku = to_item["sku"]
        brightness_gap = abs(_brightness_level(from_sku) - _brightness_level(to_sku))
        viscosity_gap = abs(_viscosity_level(from_sku) - _viscosity_level(to_sku))
        gloss_gap = abs(_gloss_level(from_sku) - _gloss_level(to_sku))
        package_changed = from_item["package_size"] != to_item["package_size"]
        family_changed = from_sku["color_family"] != to_sku["color_family"]
        metallic_change = _is_metallic(from_sku) != _is_metallic(to_sku)

        complexity = 1.0
        complexity += brightness_gap / 75.0
        complexity += viscosity_gap / 120.0
        # 광택 차이는 viscosity와 같은 0~100 스케일이지만 세척 항에 별도로 가산되므로
        # complexity 쪽은 분모를 조금 더 키워 이중 계상의 영향을 줄였다.
        complexity += gloss_gap / 140.0
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
        # 광택 잔류는 세척 부담의 직접 신호이므로 wash_cost에 선형 항을 더한다.
        # gloss_gap 0~70 → 최대 약 6300원, family_changed 점프(6500)와 비슷한 크기.
        wash_cost = (
            14000.0 * complexity
            + (6500.0 if family_changed else 1500.0)
            + 90.0 * gloss_gap
        )
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


def _gloss_level(sku: dict[str, Any]) -> float:
    """SKU dict의 광택 값을 0~100 레벨로 정규화한다.

    CSV는 0~1 스케일로 저장되지만 향후 다른 입력이 0~100으로 들어와도
    안전하도록 ≤1 인 값만 ×100 한다. 누락/공백은 50.0으로 대체해
    gap이 0이 되도록 한다(기존 동작 보존).
    """
    raw = sku.get("gloss_level")
    if raw in ("", None):
        return 50.0
    value = float(raw)
    return value * 100.0 if value <= 1.0 else value


def _is_metallic(sku: dict[str, Any]) -> bool:
    if "is_metallic" in sku and sku["is_metallic"] not in ("", None):
        return bool(int(sku["is_metallic"]))
    return sku.get("category") in {"metal", "special"}
