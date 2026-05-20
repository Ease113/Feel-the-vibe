"""pytest가 실 DB와 학습된 XGBoost 모델 산출물을 오염시키지 않도록 격리한다.

``app.core.config``는 모듈 import 시점에 env를 평가하므로 ``app.main`` 등
어떤 app 모듈도 import되기 전에 env를 세팅해야 한다. conftest.py는 pytest가
가장 먼저 로드하므로 여기 module-level이 적절하다.

- ``SMARTFACTORY_DB_PATH``로 SQLite 경로를 임시 디렉토리로 분리.
- ``SMARTFACTORY_MODEL_DIR``로 XGBoost 모델 디렉토리도 빈 임시 디렉토리로 분리.
  이렇게 두면 실제 학습 산출물(`backend/app/data/models/*.json`)이 커밋되어
  있어도 기존 smoke test는 heuristic 경로를 사용해 결정적으로 동작한다.
  test_xgboost는 이 임시 디렉토리에 직접 모델을 학습·저장한 뒤 fixture로
  정리한다.
"""

import os
import tempfile
from pathlib import Path

_TMP_DIR = Path(tempfile.mkdtemp(prefix="smartfactory-test-"))
os.environ["SMARTFACTORY_DB_PATH"] = str(_TMP_DIR / "test.sqlite3")
os.environ["SMARTFACTORY_MODEL_DIR"] = str(_TMP_DIR / "models")
