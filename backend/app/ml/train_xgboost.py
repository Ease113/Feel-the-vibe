"""XGBoost 전환 비용 예측 모델 학습 스크립트.

`transition_history_train.csv`로 6개 차원(setup_time, labor_cost, material_loss,
wash_cost, downtime, packaging_time)을 독립 회귀로 학습하고, 차원별 모델 파일을
XGBoost 네이티브 JSON 형식으로 저장한다. 학습 종료 후 test set에 대해
XGBoost와 heuristic baseline의 MAE를 같이 출력해 demo에서 비교 가치를
설명할 수 있게 한다.

실행:
    cd backend
    python -m app.ml.train_xgboost
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.core.config import DATA_RAW_DIR
from app.ml.features import FEATURE_COLUMNS, build_features_from_history
from app.ml.model_registry import MODEL_DIMENSIONS, get_model_dir

TARGETS: tuple[str, ...] = MODEL_DIMENSIONS

# xgb.train()용 파라미터. XGBRegressor(sklearn 의존) 대신 low-level API를
# 사용해 scikit-learn 의존을 회피한다. num_boost_round는 별도 인자로 전달.
HYPERPARAMS: dict[str, Any] = {
    "objective": "reg:squarederror",
    "max_depth": 5,
    "learning_rate": 0.08,
    "verbosity": 0,
    "seed": 42,
    "nthread": -1,
}
NUM_BOOST_ROUND: int = 200


def _mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Mean Absolute Error. sklearn 의존 없이 numpy로 계산한다."""
    return float(np.mean(np.abs(np.asarray(y_true) - np.asarray(y_pred))))


def _heuristic_baseline(history_df: pd.DataFrame, sku_df: pd.DataFrame) -> pd.DataFrame:
    """Test set 전 행에 대해 heuristic CostPredictor를 호출해 6차원 예측을 반환한다.

    XGBoost vs heuristic의 MAE 비교를 위한 baseline. 학습 자료에서 "왜 XGBoost가
    필요한가"를 수치로 보여주는 근거가 된다.
    """
    from app.services.cost_predictor import CostPredictor

    sku_map = {row["sku_id"]: row.to_dict() for _, row in sku_df.iterrows()}
    predictor = CostPredictor.heuristic_only()
    records: list[dict[str, float]] = []
    for _, row in history_df.iterrows():
        from_item = {
            "sku": sku_map[row["from_sku"]],
            "package_size": row["from_package_size"],
        }
        to_item = {
            "sku": sku_map[row["to_sku"]],
            "package_size": row["to_package_size"],
        }
        context = {
            "worker_skill": row["worker_skill"],
            "crew_size": row["crew_size"],
            "days_since_last_clean": row["days_since_last_clean"],
            "equipment_condition": row["equipment_condition"],
            "day_of_week": row["day_of_week"],
            "shift": row["shift"],
        }
        records.append(predictor.predict_transition(from_item, to_item, context))
    return pd.DataFrame(records)


def main() -> None:
    """학습 파이프라인 진입점. 6개 모델을 학습·저장하고 MAE report를 작성한다."""
    import xgboost as xgb

    train_df = pd.read_csv(DATA_RAW_DIR / "transition_history_train.csv")
    test_df = pd.read_csv(DATA_RAW_DIR / "transition_history_test.csv")
    sku_df = pd.read_csv(DATA_RAW_DIR / "sku_master.csv")

    X_train = build_features_from_history(train_df, sku_df)
    X_test = build_features_from_history(test_df, sku_df)

    model_dir = get_model_dir()
    model_dir.mkdir(parents=True, exist_ok=True)

    print(f"Training 6 XGBoost regressors. Output dir: {model_dir}")
    print(f"Feature columns ({len(FEATURE_COLUMNS)}): {list(FEATURE_COLUMNS)}")

    heuristic_preds = _heuristic_baseline(test_df, sku_df)
    dtest = xgb.DMatrix(X_test)
    report_lines = ["dimension,mae_xgboost,mae_heuristic,relative_improvement"]
    for dim in TARGETS:
        dtrain = xgb.DMatrix(X_train, label=train_df[dim].to_numpy())
        booster = xgb.train(HYPERPARAMS, dtrain, num_boost_round=NUM_BOOST_ROUND)
        booster.save_model(str(model_dir / f"{dim}.json"))

        mae_xgb = _mae(test_df[dim].to_numpy(), booster.predict(dtest))
        mae_heur = _mae(test_df[dim].to_numpy(), heuristic_preds[dim].to_numpy())
        rel = (mae_heur - mae_xgb) / mae_heur if mae_heur > 0 else 0.0
        report_lines.append(f"{dim},{mae_xgb:.2f},{mae_heur:.2f},{rel * 100:.1f}%")
        print(f"  {dim}: mae_xgb={mae_xgb:.2f}  mae_heuristic={mae_heur:.2f}  Δ={rel * 100:+.1f}%")

    report_path = model_dir / "training_report.txt"
    report_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    print(f"Training report written to {report_path}")


if __name__ == "__main__":
    main()
