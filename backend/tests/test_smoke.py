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
