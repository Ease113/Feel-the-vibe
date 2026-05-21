"""CSV/JSON 합성 데이터 로더. ML 스택 없이도 동작하도록 표준 라이브러리만 사용한다."""

import csv
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import DATA_RAW_DIR


class DataLoader:
    """Loads MVP CSV/JSON source data.

    The loader intentionally uses the standard library so the API can still run
    in minimal environments before the full ML stack is installed.
    """

    def __init__(self, data_dir: Path = DATA_RAW_DIR) -> None:
        """데이터 디렉토리를 주입받아 초기화한다. 기본값은 app/data/raw다."""
        self.data_dir = data_dir

    def get_skus(self) -> list[dict[str, Any]]:
        """sku_master.csv의 전체 SKU 목록을 반환한다."""
        return _read_csv(self.data_dir / "sku_master.csv")

    def get_sku_map(self) -> dict[str, dict[str, Any]]:
        """sku_id를 키로 하는 SKU 딕셔너리를 반환한다."""
        return {sku["sku_id"]: sku for sku in self.get_skus()}

    def get_plan_items(self, plan_id: str) -> list[dict[str, Any]]:
        """지정된 plan_id에 속한 plan item 목록에 sku 정보를 조인해 반환한다.

        Args:
            plan_id: 조회할 생산 계획 식별자.

        Returns:
            sku 키가 포함된 plan item 딕셔너리 목록. quantity는 float, due_priority는 int로 변환된다.
        """
        items = [
            item for item in _read_csv(self.data_dir / "daily_plan.csv")
            if item["plan_id"] == plan_id
        ]
        sku_map = self.get_sku_map()
        for item in items:
            item["quantity"] = float(item["quantity"])
            item["due_priority"] = int(item["due_priority"])
            item["sku"] = sku_map[item["sku_id"]]
        return items

    def get_plan_item_map(self, plan_id: str) -> dict[str, dict[str, Any]]:
        """plan_item_id를 키로 하는 plan item 딕셔너리를 반환한다."""
        return {item["plan_item_id"]: item for item in self.get_plan_items(plan_id)}

    def get_plan_context(self, plan_id: str) -> dict[str, Any]:
        """plan_context.json에서 plan_id에 맞는 라인 컨텍스트를 반환한다.

        파일이 없거나 해당 plan_id가 없으면 데모용 기본 컨텍스트를 반환한다.

        Args:
            plan_id: 컨텍스트를 조회할 생산 계획 식별자.

        Returns:
            line_id, shift, crew_size, worker_skill 등 운영 컨텍스트 딕셔너리.
        """
        contexts_path = self.data_dir / "plan_context.json"
        if contexts_path.exists():
            contexts = json.loads(contexts_path.read_text(encoding="utf-8"))
            if plan_id in contexts:
                return contexts[plan_id]
        return {
            "line_id": "LINE-01",
            "shift": "day",
            "crew_size": 3,
            "worker_skill": 0.6,
            "days_since_last_clean": 2,
            "equipment_condition": 0.7,
            "day_of_week": 4,
            "context_version": "context-v1",
        }

    def merge_operating_context(
        self,
        plan_id: str,
        override: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """plan_context.json 기본값에 요청 override를 덮어쓴 컨텍스트 dict를 반환한다.

        override는 shift, crew_size 두 키만 인식하며 None이거나 키가 없으면 기본값을
        유지한다. dropdown으로 노출되지 않는 worker_skill, equipment_condition 등
        다른 컨텍스트 필드는 plan_context 값을 보존한다.

        Args:
            plan_id: 기본 컨텍스트를 조회할 plan_id.
            override: 사용자 입력 override. shift, crew_size 키만 반영한다.

        Returns:
            merge된 운영 컨텍스트 dict. 입력이 None이면 plan_context 원본을 그대로 반환.
        """
        base = self.get_plan_context(plan_id)
        if not override:
            return base
        merged = dict(base)
        for key in ("shift", "crew_size"):
            if override.get(key) is not None:
                merged[key] = override[key]
        return merged

    def get_rules(self) -> dict[str, Any]:
        """sequence_rules.json에서 색상 전환 규칙 목록과 버전 정보를 반환한다."""
        path = self.data_dir / "sequence_rules.json"
        if not path.exists():
            return {"rule_version": "rules-2026.05.v1", "rules": []}
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            rule_version = payload[0].get("rule_version", "rules-2026.05.v1") if payload else "rules-2026.05.v1"
            return {"rule_version": rule_version, "rules": payload}
        return payload


@lru_cache(maxsize=16)
def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        raise FileNotFoundError(
            f"Required data file is missing: {path}. Run `python ../scripts/seed_data.py` from backend."
        )
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))
