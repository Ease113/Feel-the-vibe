"""XGBoost 모델 파일 경로 레지스트리."""

from pathlib import Path

from app.core.config import DATA_MODEL_DIR


def get_model_path() -> Path:
    """XGBoost 모델 파일의 경로를 반환하고 부모 디렉토리를 생성한다.

    Returns:
        xgboost_transition_cost.json의 절대 경로.
    """
    DATA_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_MODEL_DIR / "xgboost_transition_cost.json"
