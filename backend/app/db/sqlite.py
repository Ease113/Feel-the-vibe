"""SQLite 연결 팩토리 및 스키마 초기화 유틸리티."""

import logging
import sqlite3

from app.core.config import SCHEMA_PATH, SQLITE_PATH

_log = logging.getLogger(__name__)

# 새 decisions 스키마를 식별하는 sentinel 컬럼.
# schema.sql의 decisions 테이블이 변경되면 함께 갱신해야 한다.
_DECISIONS_SENTINEL_COLUMNS = frozenset(
    {"confirmed_at", "applied_weights", "context_snapshot", "confirmed_cost_vector"}
)


def get_connection() -> sqlite3.Connection:
    """SQLite 연결을 열고 row_factory를 sqlite3.Row로 설정해 반환한다.

    데이터 디렉토리가 없으면 자동으로 생성한다.

    Returns:
        컬럼명 인덱스 접근이 가능한 sqlite3.Connection 인스턴스.
    """
    SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(SQLITE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    """schema.sql을 실행해 DB 테이블을 생성한다.

    legacy decisions 스키마(예: created_at만 있는 구버전)가 감지되면
    DROP 후 새 스키마로 재생성한다. 해커톤 demo 데이터는 재생성 가능하므로
    데이터 손실은 WARNING 로그로만 알린다.
    """
    with get_connection() as connection:
        _recreate_decisions_if_legacy(connection)
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def _recreate_decisions_if_legacy(connection: sqlite3.Connection) -> None:
    """Decisions 테이블이 legacy 스키마면 DROP하고 WARNING을 남긴다.

    schema.sql의 ``CREATE TABLE IF NOT EXISTS``가 기존 legacy 테이블을 무시해
    이후 ``CREATE INDEX ON decisions (confirmed_at)``이 실패하는 문제를 차단한다.

    Args:
        connection: 현재 SQLite 연결. 호출자가 컨텍스트 관리한다.
    """
    rows = connection.execute("PRAGMA table_info(decisions)").fetchall()
    if not rows:
        return  # 테이블 미존재 — CREATE가 처음으로 생성한다.
    existing = {row[1] for row in rows}
    if _DECISIONS_SENTINEL_COLUMNS.issubset(existing):
        return  # 이미 새 스키마.
    row_count = connection.execute("SELECT COUNT(*) FROM decisions").fetchone()[0]
    _log.warning(
        "Legacy decisions schema detected — dropping and recreating (data loss: %d rows)",
        row_count,
    )
    connection.execute("DROP TABLE decisions")
