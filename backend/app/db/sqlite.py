"""SQLite 연결 팩토리 및 스키마 초기화 유틸리티."""

import sqlite3

from app.core.config import SCHEMA_PATH, SQLITE_PATH


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

    이미 테이블이 존재하면 CREATE TABLE IF NOT EXISTS에 의해 무시된다.
    """
    with get_connection() as connection:
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
