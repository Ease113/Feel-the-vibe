"""학습/추론 공통 feature 생성기.

이 모듈은 XGBoost 학습 파이프라인(`train_xgboost.py`)과 추론 분기
(`CostPredictor._predict_xgboost`)가 **반드시 동일한 컬럼 순서와 동일한
파생 식**을 사용하도록 단일 진실원천 역할을 한다. 두 경로에 같은 컬럼을
주지 못하면 XGBoost가 silent하게 잘못된 차원에 학습된 가중치를 사용한다.
"""

from typing import Any

import pandas as pd

METAL_CATEGORIES = frozenset({"metal", "special"})

NUMERIC_CONTEXT_COLUMNS: tuple[str, ...] = (
    "worker_skill",
    "crew_size",
    "days_since_last_clean",
    "equipment_condition",
    "day_of_week",
)

TRANSITION_DERIVED_COLUMNS: tuple[str, ...] = (
    "brightness_gap",
    "viscosity_gap",
    "gloss_gap",
    "family_changed",
    "metallic_change",
    "package_changed",
)

SHIFT_ONEHOT_COLUMNS: tuple[str, ...] = ("shift_night",)

FEATURE_COLUMNS: tuple[str, ...] = (
    NUMERIC_CONTEXT_COLUMNS
    + SHIFT_ONEHOT_COLUMNS
    + TRANSITION_DERIVED_COLUMNS
)


def build_features_from_history(
    history_df: pd.DataFrame,
    sku_df: pd.DataFrame,
) -> pd.DataFrame:
    """학습용 feature DataFrame을 생성한다.

    transition_history CSV(`from_sku`, `to_sku` 문자열)와 sku_master CSV를
    join해 `pigment_intensity`, `viscosity`, `gloss_level`, `category`,
    `color_family`를 양쪽(from/to)에 붙인 뒤 heuristic과 동일한 식으로
    `*_gap`, `*_changed` 파생 컬럼을 만든다.

    Args:
        history_df: transition_history_train.csv / _test.csv를 그대로 읽은 DataFrame.
        sku_df: sku_master.csv를 그대로 읽은 DataFrame.

    Returns:
        FEATURE_COLUMNS 순서로 정렬된 학습용 입력 DataFrame.
    """
    sku_cols = ["sku_id", "color_family", "pigment_intensity", "gloss_level", "viscosity", "category"]
    sku_slim = sku_df[sku_cols].copy()
    sku_slim["pigment_intensity"] = sku_slim["pigment_intensity"].astype(float)
    sku_slim["gloss_level"] = sku_slim["gloss_level"].astype(float)
    sku_slim["viscosity"] = sku_slim["viscosity"].astype(float)

    from_cols = sku_slim.add_prefix("from_").rename(columns={"from_sku_id": "from_sku"})
    to_cols = sku_slim.add_prefix("to_").rename(columns={"to_sku_id": "to_sku"})

    df = history_df.merge(from_cols, on="from_sku", how="left")
    df = df.merge(to_cols, on="to_sku", how="left")

    features = pd.DataFrame(index=df.index)
    features["worker_skill"] = df["worker_skill"].astype(float)
    features["crew_size"] = df["crew_size"].astype(int)
    features["days_since_last_clean"] = df["days_since_last_clean"].astype(int)
    features["equipment_condition"] = df["equipment_condition"].astype(float)
    features["day_of_week"] = df["day_of_week"].astype(int)
    features["shift_night"] = (df["shift"].astype(str) == "night").astype(int)

    features["brightness_gap"] = (
        ((1.0 - df["from_pigment_intensity"]) * 100.0)
        - ((1.0 - df["to_pigment_intensity"]) * 100.0)
    ).abs()
    features["viscosity_gap"] = (df["from_viscosity"] * 100.0 - df["to_viscosity"] * 100.0).abs()
    features["gloss_gap"] = (df["from_gloss_level"] * 100.0 - df["to_gloss_level"] * 100.0).abs()
    features["family_changed"] = (df["from_color_family"] != df["to_color_family"]).astype(int)
    from_metal = df["from_category"].isin(METAL_CATEGORIES)
    to_metal = df["to_category"].isin(METAL_CATEGORIES)
    features["metallic_change"] = (from_metal != to_metal).astype(int)
    features["package_changed"] = (df["from_package_size"] != df["to_package_size"]).astype(int)

    return features[list(FEATURE_COLUMNS)]


def build_features_for_transition(
    from_item: dict[str, Any],
    to_item: dict[str, Any],
    context: dict[str, Any],
) -> pd.DataFrame:
    """추론용 단일 행 feature DataFrame을 생성한다.

    `CostPredictor.predict_transition`의 입력 dict(`sku` 키, `package_size`,
    context dict)에서 학습 시점과 정확히 같은 컬럼·순서의 한 행짜리
    DataFrame을 만든다. 컬럼명은 `FEATURE_COLUMNS`와 1:1 일치한다.

    Args:
        from_item: 직전 plan item. `sku`(dict), `package_size`(str)을 포함.
        to_item: 다음 plan item. 동일 구조.
        context: 라인 컨텍스트. NUMERIC_CONTEXT_COLUMNS와 `shift`를 포함.

    Returns:
        FEATURE_COLUMNS 순서를 그대로 따르는 1행 DataFrame.
    """
    from_sku = from_item["sku"]
    to_sku = to_item["sku"]

    from_pigment = float(from_sku["pigment_intensity"])
    to_pigment = float(to_sku["pigment_intensity"])
    from_viscosity = float(from_sku["viscosity"])
    to_viscosity = float(to_sku["viscosity"])
    from_gloss = float(from_sku["gloss_level"])
    to_gloss = float(to_sku["gloss_level"])

    row = {
        "worker_skill": float(context.get("worker_skill", 0.6)),
        "crew_size": int(context.get("crew_size", 3)),
        "days_since_last_clean": int(context.get("days_since_last_clean", 2)),
        "equipment_condition": float(context.get("equipment_condition", 0.7)),
        "day_of_week": int(context.get("day_of_week", 4)),
        "shift_night": int(str(context.get("shift", "day")) == "night"),
        "brightness_gap": abs((1.0 - from_pigment) * 100.0 - (1.0 - to_pigment) * 100.0),
        "viscosity_gap": abs(from_viscosity * 100.0 - to_viscosity * 100.0),
        "gloss_gap": abs(from_gloss * 100.0 - to_gloss * 100.0),
        "family_changed": int(from_sku["color_family"] != to_sku["color_family"]),
        "metallic_change": int(
            (from_sku.get("category") in METAL_CATEGORIES)
            != (to_sku.get("category") in METAL_CATEGORIES)
        ),
        "package_changed": int(from_item["package_size"] != to_item["package_size"]),
    }
    return pd.DataFrame([row], columns=list(FEATURE_COLUMNS))
