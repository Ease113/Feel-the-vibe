import csv
import json
import random
from datetime import date, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "backend" / "app" / "data" / "raw"

RANDOM_SEED = 20260517

SKUS = [
    ("SKU-WHITE-001", "Pure White", "white", "#F8F8F3", "light", 0, 92, 34),
    ("SKU-IVORY-001", "Warm Ivory", "white", "#F2E6C8", "light", 0, 84, 38),
    ("SKU-YELLOW-001", "Safety Yellow", "yellow", "#F6C945", "light", 0, 78, 42),
    ("SKU-RED-001", "Signal Red", "red", "#C83A32", "mid", 0, 48, 57),
    ("SKU-BLUE-001", "Deep Blue", "blue", "#1E4D8F", "dark", 0, 30, 60),
    ("SKU-GREEN-001", "Machine Green", "green", "#2B7A4B", "mid", 0, 42, 52),
    ("SKU-GRAY-001", "Neutral Gray", "gray", "#777C80", "mid", 0, 55, 45),
    ("SKU-BLACK-001", "Jet Black", "black", "#101214", "dark", 0, 8, 62),
    ("SKU-SILVER-001", "Metallic Silver", "silver", "#C4C8C8", "metal", 1, 76, 50),
    ("SKU-GOLD-001", "Metallic Gold", "gold", "#C8A641", "metal", 1, 70, 53),
    ("SKU-ORANGE-001", "Safety Orange", "orange", "#E56F24", "mid", 0, 58, 49),
    ("SKU-PURPLE-001", "Deep Purple", "purple", "#59306E", "dark", 0, 25, 58),
]

PLAN_ITEMS = [
    ("demo-plan-001", "PI-001", "2026-05-17", "SKU-BLACK-001", 240.0, "18L", 3, "LINE-01"),
    ("demo-plan-001", "PI-002", "2026-05-17", "SKU-WHITE-001", 180.0, "4L", 2, "LINE-01"),
    ("demo-plan-001", "PI-003", "2026-05-17", "SKU-SILVER-001", 120.0, "4L", 4, "LINE-01"),
    ("demo-plan-001", "PI-004", "2026-05-17", "SKU-BLUE-001", 210.0, "18L", 3, "LINE-01"),
    ("demo-plan-001", "PI-005", "2026-05-17", "SKU-GRAY-001", 160.0, "1L", 5, "LINE-01"),
]


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def sku_rows() -> list[dict]:
    return [
        {
            "sku_id": sku_id,
            "sku_name": sku_name,
            "color_family": color_family,
            "color_hex": color_hex,
            "category": category,
            "is_metallic": is_metallic,
            "brightness_level": brightness_level,
            "viscosity_level": viscosity_level,
        }
        for (
            sku_id,
            sku_name,
            color_family,
            color_hex,
            category,
            is_metallic,
            brightness_level,
            viscosity_level,
        ) in SKUS
    ]


def plan_rows() -> list[dict]:
    return [
        {
            "plan_id": plan_id,
            "plan_item_id": plan_item_id,
            "plan_date": plan_date,
            "sku_id": sku_id,
            "quantity": quantity,
            "package_size": package_size,
            "due_priority": due_priority,
            "line_id": line_id,
        }
        for (
            plan_id,
            plan_item_id,
            plan_date,
            sku_id,
            quantity,
            package_size,
            due_priority,
            line_id,
        ) in PLAN_ITEMS
    ]


def transition_cost(from_sku: dict, to_sku: dict, package_changed: bool, context: dict) -> dict:
    brightness_gap = abs(from_sku["brightness_level"] - to_sku["brightness_level"])
    viscosity_gap = abs(from_sku["viscosity_level"] - to_sku["viscosity_level"])
    family_changed = from_sku["color_family"] != to_sku["color_family"]
    metallic_change = from_sku["is_metallic"] != to_sku["is_metallic"]

    complexity = 1.0
    complexity += brightness_gap / 75.0
    complexity += viscosity_gap / 120.0
    complexity += 0.25 if package_changed else 0.0
    complexity += 0.35 if family_changed else 0.0
    complexity += 0.45 if metallic_change else 0.0
    complexity += context["days_since_last_clean"] * 0.03
    complexity += (1.0 - context["equipment_condition"]) * 0.25
    complexity -= context["worker_skill"] * 0.12
    complexity += random.uniform(-0.04, 0.04)

    setup_time = max(6.0, 11.0 * complexity)
    downtime = max(3.0, 5.0 * complexity)
    packaging_time = 5.0 + (5.0 if package_changed else 1.2) + complexity
    material_loss = max(0.5, 1.2 * complexity + brightness_gap / 90.0)
    wash_cost = 14000.0 * complexity + (6500.0 if family_changed else 1500.0)
    labor_cost = setup_time * context["crew_size"] * 850.0
    violation = int(
        (from_sku["color_family"] == "black" and to_sku["color_family"] == "white")
        or (from_sku["brightness_level"] < 35 and to_sku["brightness_level"] > 70)
        or (from_sku["is_metallic"] == 1 and to_sku["is_metallic"] == 0)
    )
    return {
        "setup_time": round(setup_time, 2),
        "labor_cost": round(labor_cost, 2),
        "material_loss": round(material_loss, 2),
        "wash_cost": round(wash_cost, 2),
        "packaging_time": round(packaging_time, 2),
        "downtime": round(downtime, 2),
        "sequence_violation_ref": violation,
    }


def transition_rows() -> list[dict]:
    random.seed(RANDOM_SEED)
    rows = []
    skus = sku_rows()
    package_sizes = ["1L", "4L", "18L"]
    shifts = ["day", "night"]
    worker_skills = [0.3, 0.6, 0.9]
    equipment_conditions = [0.3, 0.7, 1.0]
    start_date = date(2026, 4, 1)

    for index in range(1, 1501):
        from_sku = random.choice(skus)
        if index <= len(skus) * len(skus):
            from_sku = skus[(index - 1) // len(skus)]
            to_sku = skus[(index - 1) % len(skus)]
        else:
            to_sku = random.choice(skus)
        transition_date = start_date + timedelta(days=index % 45)
        from_package = random.choice(package_sizes)
        to_package = random.choice(package_sizes)
        context = {
            "worker_skill": random.choice(worker_skills),
            "crew_size": random.randint(2, 5),
            "days_since_last_clean": random.randint(0, 7),
            "equipment_condition": random.choice(equipment_conditions),
            "shift": random.choice(shifts),
            "day_of_week": transition_date.weekday(),
        }
        costs = transition_cost(from_sku, to_sku, from_package != to_package, context)
        rows.append(
            {
                "transition_id": f"TR-{index:04d}",
                "transition_date": transition_date.isoformat(),
                "from_sku": from_sku["sku_id"],
                "to_sku": to_sku["sku_id"],
                "from_package_size": from_package,
                "to_package_size": to_package,
                **context,
                **costs,
            }
        )
    return rows


def rules_payload() -> dict:
    return {
        "rule_version": "rules-2026.05.v1",
        "rules": [
            {
                "rule_id": "SR-001",
                "rule_type": "color_transition",
                "condition": "black -> white",
                "severity": "HIGH",
                "penalty": 80.0,
            },
            {
                "rule_id": "SR-002",
                "rule_type": "color_transition",
                "condition": "dark -> light with brightness gap",
                "severity": "MEDIUM_OR_HIGH",
                "penalty": 35.0,
            },
            {
                "rule_id": "SR-003",
                "rule_type": "color_transition",
                "condition": "metallic -> non-metallic",
                "severity": "MEDIUM",
                "penalty": 32.0,
            },
            {
                "rule_id": "SR-004",
                "rule_type": "color_transition",
                "condition": "same SKU or same color family",
                "severity": "LOW",
                "penalty": 0.0,
            },
        ],
    }


def main() -> None:
    sku_fieldnames = [
        "sku_id",
        "sku_name",
        "color_family",
        "color_hex",
        "category",
        "is_metallic",
        "brightness_level",
        "viscosity_level",
    ]
    plan_fieldnames = [
        "plan_id",
        "plan_item_id",
        "plan_date",
        "sku_id",
        "quantity",
        "package_size",
        "due_priority",
        "line_id",
    ]
    transition_fieldnames = [
        "transition_id",
        "transition_date",
        "from_sku",
        "to_sku",
        "from_package_size",
        "to_package_size",
        "worker_skill",
        "crew_size",
        "days_since_last_clean",
        "equipment_condition",
        "shift",
        "day_of_week",
        "setup_time",
        "labor_cost",
        "material_loss",
        "wash_cost",
        "packaging_time",
        "downtime",
        "sequence_violation_ref",
    ]

    write_csv(RAW_DIR / "sku_master.csv", sku_fieldnames, sku_rows())
    write_csv(RAW_DIR / "daily_plan.csv", plan_fieldnames, plan_rows())
    write_csv(RAW_DIR / "transition_history.csv", transition_fieldnames, transition_rows())
    (RAW_DIR / "sequence_rules.json").write_text(
        json.dumps(rules_payload(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (RAW_DIR / "plan_context.json").write_text(
        json.dumps(
            {
                "demo-plan-001": {
                    "line_id": "LINE-01",
                    "shift": "day",
                    "crew_size": 3,
                    "worker_skill": 0.6,
                    "days_since_last_clean": 2,
                    "equipment_condition": 0.7,
                    "day_of_week": 6,
                    "context_version": "context-v1",
                }
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Seed data written to {RAW_DIR}")


if __name__ == "__main__":
    main()
