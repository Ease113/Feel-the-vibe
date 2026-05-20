"""XGBoost 추론 분기·feature drift·fallback 회귀 테스트.

conftest.py가 `SMARTFACTORY_MODEL_DIR`을 빈 임시 디렉토리로 가리키므로
default 상태에서 CostPredictor는 heuristic을 사용한다. 본 파일의
`trained_models_in_session_dir` 픽스처는 그 임시 디렉토리에 6개 차원 모델을
직접 학습·저장한 뒤 cache를 reload 하고, 테스트 종료 시 산출물을 제거해
다른 smoke 테스트에 부수효과가 없도록 한다.
"""

from __future__ import annotations

import pandas as pd
import pytest

from app.core.config import DATA_RAW_DIR
from app.ml import model_registry
from app.ml.features import FEATURE_COLUMNS, build_features_for_transition, build_features_from_history


@pytest.fixture
def trained_models_in_session_dir():
    """conftest 임시 모델 디렉토리에 6개 차원의 미니 booster를 학습·저장한다.

    Yields: 모델 디렉토리 Path.
    """
    xgb = pytest.importorskip("xgboost")
    model_dir = model_registry.get_model_dir()
    history_df = pd.read_csv(DATA_RAW_DIR / "transition_history_train.csv")
    sku_df = pd.read_csv(DATA_RAW_DIR / "sku_master.csv")
    X = build_features_from_history(history_df, sku_df)

    written: list = []
    for dim in model_registry.MODEL_DIMENSIONS:
        dtrain = xgb.DMatrix(X, label=history_df[dim].to_numpy())
        booster = xgb.train(
            {"objective": "reg:squarederror", "max_depth": 3, "verbosity": 0, "seed": 42},
            dtrain,
            num_boost_round=8,
        )
        path = model_dir / f"{dim}.json"
        booster.save_model(str(path))
        written.append(path)

    model_registry.load_models(force_reload=True)
    try:
        yield model_dir
    finally:
        for path in written:
            if path.exists():
                path.unlink()
        model_registry.load_models(force_reload=True)


def test_cost_predictor_falls_back_when_model_missing() -> None:
    """모델 디렉토리가 비어 있으면 heuristic 버전으로 떨어진다."""
    from app.services.cost_predictor import CostPredictor

    model_registry.load_models(force_reload=True)
    predictor = CostPredictor()
    assert predictor.model_version == "heuristic-v1"
    from_item = {"sku": {"color_family": "white", "pigment_intensity": 0.1, "gloss_level": 0.8, "viscosity": 0.3, "category": "light"}, "package_size": "4L"}
    to_item = {"sku": {"color_family": "black", "pigment_intensity": 0.9, "gloss_level": 0.3, "viscosity": 0.55, "category": "dark"}, "package_size": "4L"}
    result = predictor.predict_transition(from_item, to_item, {})
    assert set(result.keys()) == set(model_registry.MODEL_DIMENSIONS)


def test_cost_predictor_uses_xgboost_when_model_present(trained_models_in_session_dir) -> None:
    """6개 모델이 디스크에 있으면 xgboost-v1 경로를 사용한다."""
    from app.services.cost_predictor import CostPredictor

    predictor = CostPredictor()
    assert predictor.model_version == "xgboost-v1"

    from_item = {"sku": {"color_family": "white", "pigment_intensity": 0.1, "gloss_level": 0.8, "viscosity": 0.3, "category": "light"}, "package_size": "4L"}
    to_item = {"sku": {"color_family": "black", "pigment_intensity": 0.9, "gloss_level": 0.3, "viscosity": 0.55, "category": "dark"}, "package_size": "4L"}
    context = {
        "worker_skill": 0.6, "crew_size": 3, "days_since_last_clean": 2,
        "equipment_condition": 0.7, "day_of_week": 4, "shift": "day",
    }

    xgb_result = predictor.predict_transition(from_item, to_item, context)
    heur_result = CostPredictor.heuristic_only().predict_transition(from_item, to_item, context)
    assert set(xgb_result.keys()) == set(model_registry.MODEL_DIMENSIONS)
    # 동일 입력에 대해 두 경로의 결과가 정확히 일치할 가능성은 거의 없다.
    assert xgb_result != heur_result


def test_features_build_consistent_shape_train_vs_inference() -> None:
    """학습/추론 feature가 정확히 같은 컬럼·순서를 가지는지 회귀로 보장한다.

    drift가 생기면 booster.predict가 silent하게 잘못된 차원에 가중치를 곱해
    재현 불가능한 버그가 된다. 이 테스트가 그 회귀를 잡는다.
    """
    history_df = pd.read_csv(DATA_RAW_DIR / "transition_history_train.csv").head(3)
    sku_df = pd.read_csv(DATA_RAW_DIR / "sku_master.csv")
    train_features = build_features_from_history(history_df, sku_df)

    sku_map = {row["sku_id"]: row.to_dict() for _, row in sku_df.iterrows()}
    first = history_df.iloc[0]
    inference_features = build_features_for_transition(
        from_item={"sku": sku_map[first["from_sku"]], "package_size": first["from_package_size"]},
        to_item={"sku": sku_map[first["to_sku"]], "package_size": first["to_package_size"]},
        context={
            "worker_skill": first["worker_skill"],
            "crew_size": first["crew_size"],
            "days_since_last_clean": first["days_since_last_clean"],
            "equipment_condition": first["equipment_condition"],
            "day_of_week": first["day_of_week"],
            "shift": first["shift"],
        },
    )
    assert tuple(train_features.columns) == FEATURE_COLUMNS
    assert tuple(inference_features.columns) == FEATURE_COLUMNS
    assert tuple(train_features.columns) == tuple(inference_features.columns)
