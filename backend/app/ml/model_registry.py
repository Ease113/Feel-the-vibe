from pathlib import Path

from app.core.config import DATA_MODEL_DIR


def get_model_path() -> Path:
    DATA_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_MODEL_DIR / "xgboost_transition_cost.json"
