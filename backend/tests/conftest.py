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
# LLM 호출지점 테스트가 외부 네트워크/CLI에 의존하지 않도록 빈 문자열로 강제한다.
# config.py의 ``load_dotenv(override=False)``는 이미 설정된 값을 덮어쓰지 않으므로
# 빈 문자열을 미리 세팅하면 실제 `.env`의 API key가 테스트로 흘러들지 않는다.
# config.py의 LLM_API_KEY는 빈 문자열을 None으로 normalize 한다.
# test_llm_client는 LLMClient에 직접 인자를 주입해 분기를 확인한다.
os.environ["SMARTFACTORY_LLM_API_KEY"] = ""
