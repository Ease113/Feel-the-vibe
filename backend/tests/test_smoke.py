from fastapi.testclient import TestClient

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
            "brightness_level": "8",
            "is_metallic": "0",
        },
        {
            "sku_id": "SKU-WHITE-001",
            "color_family": "white",
            "brightness_level": "92",
            "is_metallic": "0",
        },
        "PI-001",
        "PI-002",
    )
    assert result["rule_id"] == "SR-001"
    assert result["severity"] == "HIGH"
