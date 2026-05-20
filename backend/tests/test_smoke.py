import sqlite3

from fastapi.testclient import TestClient
import pytest

from app.main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_rule_engine_black_to_white() -> None:
    from app.services.rule_engine import RuleEngine

    result = RuleEngine().evaluate_transition(
        {
            "sku_id": "SKU-BLACK-001",
            "color_family": "black",
            "category": "dark",
            "pigment_intensity": "0.90",
            "gloss_level": "0.30",
            "viscosity": "0.55",
        },
        {
            "sku_id": "SKU-WHITE-001",
            "color_family": "white",
            "category": "light",
            "pigment_intensity": "0.10",
            "gloss_level": "0.80",
            "viscosity": "0.30",
        },
        "PI-001",
        "PI-002",
    )
    assert result["rule_id"] == "SR-001"
    assert result["severity"] == "HIGH"


def test_rule_engine_metal_to_light() -> None:
    from app.services.data_loader import DataLoader
    from app.services.rule_engine import RuleEngine

    sku_map = DataLoader().get_sku_map()
    result = RuleEngine().evaluate_transition(
        sku_map["SKU-METAL-001"],
        sku_map["SKU-WHITE-001"],
        "PI-003",
        "PI-002",
    )
    assert result["rule_id"] == "SR-004"
    assert result["severity"] == "HIGH"


def test_ortools_open_path_does_not_pay_return_arc() -> None:
    pytest.importorskip("ortools")

    from app.services.optimizer import Optimizer

    score_matrix = [
        [0, 1, 2],
        [2, 0, 1],
        [1000, 2, 0],
    ]

    assert Optimizer._solve_open_path(score_matrix, time_limit_sec=1.0) == [0, 1, 2]


def test_optimize_uses_ortools_when_available() -> None:
    pytest.importorskip("ortools")
    response = client.post("/optimize", json={
        "plan_id": "demo-plan-001",
        "plan_item_ids": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"],
        "priority_profile": {},
    })
    assert response.status_code == 200
    assert response.json()["optimizer_backend"] == "ortools-routing-open-path"


def test_optimize_returns_plan_item_permutation() -> None:
    request = {
        "plan_id": "demo-plan-001",
        "plan_item_ids": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"],
        "priority_profile": {},
    }

    response = client.post("/optimize", json=request)

    assert response.status_code == 200
    payload = response.json()
    assert sorted(payload["recommended_sequence"]) == sorted(request["plan_item_ids"])
    assert payload["optimizer_backend"] in {
        "ortools-routing-open-path",
        "brute-force-fallback",
        "nearest-neighbor-fallback",
        "trivial",
    }
    assert payload["objective_score"] == round(
        payload["total_weighted_cost"] + payload["sequence_penalty"],
        2,
    )


def test_initialize_database_recovers_from_legacy_decisions_schema() -> None:
    """legacy created_at 스키마가 남아 있어도 init이 자동 복구해야 한다."""
    from app.core.config import SQLITE_PATH
    from app.db.sqlite import initialize_database

    with sqlite3.connect(SQLITE_PATH) as con:
        con.execute("DROP TABLE IF EXISTS decisions")
        con.execute(
            "CREATE TABLE decisions ("
            "decision_id TEXT PRIMARY KEY, plan_id TEXT, created_at TEXT)"
        )
        con.execute(
            "INSERT INTO decisions VALUES ('DEC-LEGACY', 'demo-plan-001', '2026-01-01')"
        )

    initialize_database()  # legacy 감지 → DROP → 새 스키마 재생성

    with sqlite3.connect(SQLITE_PATH) as con:
        cols = {row[1] for row in con.execute("PRAGMA table_info(decisions)").fetchall()}

    assert "confirmed_at" in cols
    assert "applied_weights" in cols
    assert "context_snapshot" in cols
    assert "confirmed_cost_vector" in cols


def test_decisions_lifecycle_post_get_patch_dashboard() -> None:
    """POST /decisions → GET → PATCH reviewed → /dashboard 반영을 한 번에 검증한다."""
    from app.core.config import SQLITE_PATH
    from app.db.sqlite import initialize_database

    SQLITE_PATH.unlink(missing_ok=True)  # 깨끗한 시작 상태로 격리.
    initialize_database()

    payload = {
        "plan_id": "demo-plan-001",
        "recommended_sequence": ["PI-003", "PI-001", "PI-004", "PI-005", "PI-002"],
        "confirmed_sequence": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"],
        "priority_profile": {},
    }
    created = client.post("/decisions", json=payload)
    assert created.status_code == 200
    decision_id = created.json()["decision_id"]
    assert decision_id.startswith("DEC-")

    fetched = client.get(f"/decisions/{decision_id}")
    assert fetched.status_code == 200
    body = fetched.json()
    assert "confirmed_at" in body
    assert body["plan_id"] == "demo-plan-001"
    assert body["reviewed"] is False

    patched = client.patch(f"/decisions/{decision_id}/reviewed", json={"reviewed": True})
    assert patched.status_code == 200
    assert patched.json()["reviewed"] is True

    dashboard = client.get("/dashboard")
    assert dashboard.status_code == 200
    summary = dashboard.json()["dashboard_summary"]
    assert summary["decision_count"] >= 1


def test_normalize_priority_profile_nested_shape() -> None:
    """contract nested 입력을 받으면 정본 구조 + 합=1 6차원 applied_weights를 돌려준다."""
    from app.services.priority import normalize_priority_profile

    nested = {
        "base_weight_profile_id": "factory_default_v1",
        "priorities": {"wash_cost": {"label": "HIGH", "multiplier": 1.15}},
    }
    profile, weights = normalize_priority_profile(nested)

    assert profile["base_weight_profile_id"] == "factory_default_v1"
    assert profile["priorities"]["wash_cost"]["label"] == "HIGH"
    assert profile["priorities"]["downtime"]["label"] == "NORMAL"  # 미지정 차원은 NORMAL.
    assert "setup_time" not in profile["priorities"]  # 운영자 미조절 차원은 priorities에 없음.

    assert "sequence_risk" not in weights
    assert set(weights) == {
        "setup_time", "wash_cost", "downtime", "material_loss", "packaging_time", "labor_cost",
    }
    assert abs(sum(weights.values()) - 1.0) < 0.001
    # HIGH multiplier가 적용된 wash_cost는 동일 base를 가진 material_loss(NORMAL)보다 커야 한다.
    assert weights["wash_cost"] > weights["material_loss"]


def test_normalize_priority_profile_flat_shape_graceful() -> None:
    """legacy flat 입력도 받아들여 정본 nested 구조 + 합=1 weights를 돌려준다."""
    from app.services.priority import normalize_priority_profile

    flat = {"wash_cost": {"label": "HIGH", "multiplier": 1.15}}
    profile, weights = normalize_priority_profile(flat)

    assert profile["priorities"]["wash_cost"]["label"] == "HIGH"
    assert abs(sum(weights.values()) - 1.0) < 0.001
    assert "sequence_risk" not in weights


def test_plans_default_priority_profile_uses_nested_shape() -> None:
    """/plans 응답의 default_priority_profile은 contract nested 형식이어야 한다."""
    response = client.get("/plans/demo-plan-001")
    assert response.status_code == 200
    profile = response.json()["default_priority_profile"]

    assert profile["base_weight_profile_id"] == "factory_default_v1"
    assert "priorities" in profile
    # 운영자 조절 5차원만 priorities에 포함되어야 한다.
    assert set(profile["priorities"]) == {
        "wash_cost", "downtime", "material_loss", "packaging_time", "labor_cost",
    }


def test_optimize_high_wash_priority_shifts_objective() -> None:
    """contract nested 형식의 priority_profile이 실제로 objective_score에 반영되어야 한다."""
    baseline = client.post(
        "/optimize",
        json={
            "plan_id": "demo-plan-001",
            "plan_item_ids": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"],
            "priority_profile": {},
        },
    ).json()
    high = client.post(
        "/optimize",
        json={
            "plan_id": "demo-plan-001",
            "plan_item_ids": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"],
            "priority_profile": {
                "base_weight_profile_id": "factory_default_v1",
                "priorities": {"wash_cost": {"label": "HIGH", "multiplier": 1.15}},
            },
        },
    ).json()

    # contract 형식이 silently 무시되지 않고 점수에 영향을 줘야 한다.
    assert high["objective_score"] != baseline["objective_score"]


def test_gloss_gap_increases_wash_cost_and_complexity() -> None:
    """광택도 차이가 클수록 wash_cost와 complexity 전파 항이 함께 커져야 한다."""
    from app.services.cost_predictor import CostPredictor

    predictor = CostPredictor()
    ctx = {
        "crew_size": 3,
        "worker_skill": 0.6,
        "equipment_condition": 0.7,
        "days_since_last_clean": 1,
    }

    def make_item(sku_id: str, gloss: float) -> dict:
        return {
            "sku_id": sku_id,
            "package_size": "4L",
            "sku": {
                "sku_id": sku_id,
                "color_family": "white",
                "category": "light",
                "pigment_intensity": 0.5,
                "gloss_level": gloss,
                "viscosity": 0.4,
            },
        }

    low_gap = predictor.predict_transition(
        make_item("A", 0.50), make_item("B", 0.55), ctx
    )
    high_gap = predictor.predict_transition(
        make_item("A", 0.20), make_item("B", 0.95), ctx
    )

    assert high_gap["wash_cost"] > low_gap["wash_cost"]
    # complexity가 6 차원 전체에 가산되므로 setup_time도 같이 커져야 한다.
    assert high_gap["setup_time"] >= low_gap["setup_time"]


def test_optimize_aggregated_cost_keeps_sequence_risk_display() -> None:
    """sequence_risk는 applied_weights에선 빠지지만 aggregated_cost(display)에는 남아야 한다."""
    response = client.post(
        "/optimize",
        json={
            "plan_id": "demo-plan-001",
            "plan_item_ids": ["PI-001", "PI-002", "PI-003", "PI-004", "PI-005"],
            "priority_profile": {},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "sequence_risk" in body["aggregated_cost"]
