"""pytest가 실DB(backend/app/data/smartfactory.sqlite3)를 오염시키지 않도록 격리한다.

``app.core.config.SQLITE_PATH``는 모듈 import 시점에 평가되므로,
``app.main`` 등 어떤 app 모듈도 import되기 전에 env를 세팅해야 한다.
conftest.py는 pytest가 가장 먼저 로드하므로 여기 module-level이 적절하다.
"""

import os
import tempfile
from pathlib import Path

_TMP_DB_DIR = Path(tempfile.mkdtemp(prefix="smartfactory-test-"))
os.environ["SMARTFACTORY_DB_PATH"] = str(_TMP_DB_DIR / "test.sqlite3")
