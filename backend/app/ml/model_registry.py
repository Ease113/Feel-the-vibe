"""XGBoost 모델 파일 경로 + 로더 + 모듈 캐시.

학습/추론 사이에서 모델 파일이 어디 있는지 단일 출처로 관리한다.
`load_models()`는 6개 dimension 모델을 디스크에서 읽어 모듈 레벨에 캐시한다.
이는 `Optimizer()`가 요청당 `CostPredictor()`를 새로 만들기 때문에 인스턴스
캐시로는 IO 비용을 흡수할 수 없기 때문이다.
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.core.config import DATA_MODEL_DIR

_log = logging.getLogger(__name__)

# CostPredictor.predict_transition이 반환하는 6개 dimension. 학습 스크립트도
# 정확히 같은 순서·이름으로 모델 파일을 생성한다.
MODEL_DIMENSIONS: tuple[str, ...] = (
    "setup_time",
    "labor_cost",
    "material_loss",
    "wash_cost",
    "downtime",
    "packaging_time",
)

_MODEL_CACHE: dict[str, object] | None = None
_CACHE_SOURCE_DIR: Path | None = None


def get_model_dir() -> Path:
    """XGBoost 모델이 저장되는 디렉토리 경로를 반환한다.

    `SMARTFACTORY_MODEL_DIR` 환경변수로 오버라이드 가능하며, 부모 디렉토리가
    없으면 자동 생성한다.

    Returns:
        모델 디렉토리의 절대 경로.
    """
    DATA_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_MODEL_DIR


def get_model_path(dimension: str) -> Path:
    """특정 비용 차원의 모델 파일 경로를 반환한다.

    Args:
        dimension: setup_time / labor_cost / ... 중 하나.

    Returns:
        `<model_dir>/<dimension>.json` 절대 경로.
    """
    return get_model_dir() / f"{dimension}.json"


def load_models(force_reload: bool = False) -> dict[str, object] | None:
    """6개 차원 XGBoost 모델을 모듈 캐시에서 로드한다.

    - 모든 차원의 모델 파일이 존재해야 성공으로 본다. 하나라도 없으면 None.
    - 로드 도중 예외가 나면 WARNING 로그 후 None 반환. 호출자가 try/except를
      쓰지 않도록 한다 (fallback 정책: AGENTS.md "모델 없으면 heuristic").
    - 모듈 캐시는 디렉토리 경로 기준으로 무효화한다. 테스트가
      `SMARTFACTORY_MODEL_DIR`을 임시 디렉토리로 바꿔도 자동 반영된다.

    Args:
        force_reload: True면 캐시를 무시하고 다시 디스크에서 읽는다.

    Returns:
        `{dimension: xgboost.Booster}` 딕셔너리 또는 None.
    """
    global _MODEL_CACHE, _CACHE_SOURCE_DIR

    model_dir = get_model_dir()
    if (
        not force_reload
        and _MODEL_CACHE is not None
        and _CACHE_SOURCE_DIR == model_dir
    ):
        return _MODEL_CACHE

    paths = [model_dir / f"{dim}.json" for dim in MODEL_DIMENSIONS]
    if not all(path.exists() for path in paths):
        _MODEL_CACHE = None
        _CACHE_SOURCE_DIR = model_dir
        return None

    try:
        import xgboost as xgb

        loaded: dict[str, object] = {}
        for dim, path in zip(MODEL_DIMENSIONS, paths):
            booster = xgb.Booster()
            booster.load_model(str(path))
            loaded[dim] = booster
    except Exception as exc:
        _log.warning("XGBoost model load failed, falling back to heuristic: %s", exc)
        _MODEL_CACHE = None
        _CACHE_SOURCE_DIR = model_dir
        return None

    _MODEL_CACHE = loaded
    _CACHE_SOURCE_DIR = model_dir
    return _MODEL_CACHE
