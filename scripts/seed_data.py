import csv
import json
import math
import random
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "backend" / "app" / "data" / "raw"

RANDOM_SEED = 42
TARGET_TOTAL = 1500
TARGET_TRAIN = 1200
TARGET_TEST = 300
BASE_PER_PATTERN = 10
HIGH_RISK_BONUS = 60
DATE_START = date(2025, 11, 1)
DATE_END = date(2026, 4, 30)
PACKAGE_SIZES = ["1L", "4L", "18L"]
PACKAGE_WEIGHTS = [0.40, 0.40, 0.20]

SKUS = [
    ("SKU-WHITE-001", "흰색", "light", "white", 0.10, 0.80, 0.30, "#FFFFFF"),
    ("SKU-IVORY-001", "아이보리", "light", "white", 0.20, 0.70, 0.32, "#FFFFF0"),
    ("SKU-LGRAY-001", "연회색", "light", "gray", 0.30, 0.60, 0.35, "#D3D3D3"),
    ("SKU-GRAY-001", "회색", "mid", "gray", 0.50, 0.50, 0.40, "#808080"),
    ("SKU-BLUE-001", "파랑", "mid", "blue", 0.60, 0.50, 0.42, "#4169E1"),
    ("SKU-RED-001", "빨강", "mid", "red", 0.65, 0.50, 0.45, "#DC143C"),
    ("SKU-GREEN-001", "녹색", "mid", "green", 0.60, 0.50, 0.42, "#228B22"),
    ("SKU-BROWN-001", "갈색", "dark", "brown", 0.70, 0.40, 0.48, "#8B4513"),
    ("SKU-DGRAY-001", "진회색", "dark", "gray", 0.75, 0.40, 0.50, "#404040"),
    ("SKU-BLACK-001", "검정", "dark", "black", 0.90, 0.30, 0.55, "#111111"),
    ("SKU-METAL-001", "금속색", "metal", "metal", 0.70, 0.95, 0.65, "#C0C0C0"),
    ("SKU-SPECIAL-001", "특수광택", "special", "special", 0.60, 0.98, 0.70, "#FFD700"),
]

PLAN_ITEMS = [
    ("demo-plan-001", "PI-001", "2026-05-17", "SKU-BLACK-001", 240.0, "18L", 3, "LINE-01"),
    ("demo-plan-001", "PI-002", "2026-05-17", "SKU-WHITE-001", 180.0, "4L", 2, "LINE-01"),
    ("demo-plan-001", "PI-003", "2026-05-17", "SKU-METAL-001", 120.0, "4L", 4, "LINE-01"),
    ("demo-plan-001", "PI-004", "2026-05-17", "SKU-BLUE-001", 210.0, "18L", 3, "LINE-01"),
    ("demo-plan-001", "PI-005", "2026-05-17", "SKU-GRAY-001", 160.0, "1L", 5, "LINE-01"),
]


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def sku_rows() -> list[dict]:
    return [
        {
            "sku_id": sku_id,
            "sku_name": sku_name,
            "category": category,
            "color_family": color_family,
            "pigment_intensity": pigment_intensity,
            "gloss_level": gloss_level,
            "viscosity": viscosity,
            "hex_code": hex_code,
        }
        for (
            sku_id,
            sku_name,
            category,
            color_family,
            pigment_intensity,
            gloss_level,
            viscosity,
            hex_code,
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


def transition_cost(
    from_sku: dict,
    to_sku: dict,
    from_package: str,
    to_package: str,
    context: dict,
    rng: random.Random,
) -> dict:
    pigment_delta = abs(float(from_sku["pigment_intensity"]) - float(to_sku["pigment_intensity"]))
    gloss_delta = abs(float(from_sku["gloss_level"]) - float(to_sku["gloss_level"]))

    skill_factor = 1.5 - float(context["worker_skill"])
    equip_factor = 1.4 - float(context["equipment_condition"])
    clean_factor = 1.0 + int(context["days_since_last_clean"]) * 0.08
    shift_factor = 1.15 if context["shift"] == "night" else 1.0

    setup_time = _clip(
        (10.0 + pigment_delta * 30.0) * skill_factor * equip_factor
        + rng.gauss(0.0, 3.0)
    )
    wash_cost = _clip(
        (20000.0 + pigment_delta * 80000.0 + gloss_delta * 40000.0)
        * clean_factor
        * equip_factor
        + rng.gauss(0.0, 5000.0)
    )
    labor_cost = _clip(
        (50000.0 + pigment_delta * 60000.0) * skill_factor * shift_factor
        + rng.gauss(0.0, 8000.0)
    )
    material_loss = _clip(
        (1.0 + pigment_delta * 6.0) * equip_factor
        + rng.gauss(0.0, 0.3)
    )
    packaging_time = _clip(
        (5.0 if from_package == to_package else 15.0)
        + rng.gauss(0.0, 2.0)
    )
    downtime = _clip(
        (8.0 + pigment_delta * 20.0 + gloss_delta * 10.0) * equip_factor
        + rng.gauss(0.0, 2.0)
    )

    return {
        "setup_time": round(setup_time, 2),
        "labor_cost": round(labor_cost, 2),
        "material_loss": round(material_loss, 4),
        "wash_cost": round(wash_cost, 2),
        "packaging_time": round(packaging_time, 2),
        "downtime": round(downtime, 2),
    }


def transition_rows() -> list[dict]:
    rng = random.Random(RANDOM_SEED)
    rows = []
    skus = sku_rows()
    sku_map = {sku["sku_id"]: sku for sku in skus}
    sku_ids = list(sku_map)
    all_patterns = [(from_sku, to_sku) for from_sku in sku_ids for to_sku in sku_ids]
    high_risk_patterns = [
        pattern
        for pattern in all_patterns
        if (rule := _match_rule(sku_map[pattern[0]], sku_map[pattern[1]])) and rule["risk"] == "high"
    ]

    index = 1
    for from_sku_id, to_sku_id in all_patterns:
        for _ in range(BASE_PER_PATTERN):
            rows.append(_make_transition_row(index, sku_map[from_sku_id], sku_map[to_sku_id], rng))
            index += 1

    per_high = HIGH_RISK_BONUS // len(high_risk_patterns)
    extra = HIGH_RISK_BONUS - per_high * len(high_risk_patterns)
    for pattern_index, (from_sku_id, to_sku_id) in enumerate(high_risk_patterns):
        count = per_high + (1 if pattern_index < extra else 0)
        for _ in range(count):
            rows.append(_make_transition_row(index, sku_map[from_sku_id], sku_map[to_sku_id], rng))
            index += 1

    if len(rows) != TARGET_TOTAL:
        raise RuntimeError(f"Expected {TARGET_TOTAL} transition rows, generated {len(rows)}")
    return rows


def _make_transition_row(index: int, from_sku: dict, to_sku: dict, rng: random.Random) -> dict:
    transition_date = DATE_START + timedelta(days=rng.randrange((DATE_END - DATE_START).days + 1))
    from_package = rng.choices(PACKAGE_SIZES, weights=PACKAGE_WEIGHTS, k=1)[0]
    to_package = rng.choices(PACKAGE_SIZES, weights=PACKAGE_WEIGHTS, k=1)[0]
    context = {
        "worker_skill": rng.choice([0.3, 0.6, 0.9]),
        "crew_size": rng.randint(2, 5),
        "days_since_last_clean": rng.choice([0, 1, 3, 7]),
        "equipment_condition": rng.choice([0.3, 0.7, 1.0]),
        "shift": rng.choice(["day", "night"]),
        "day_of_week": transition_date.weekday(),
    }
    costs = transition_cost(from_sku, to_sku, from_package, to_package, context, rng)
    return {
        "transition_id": f"TR-{index:04d}",
        "transition_date": transition_date.isoformat(),
        "from_sku": from_sku["sku_id"],
        "to_sku": to_sku["sku_id"],
        "from_package_size": from_package,
        "to_package_size": to_package,
        **context,
        **costs,
        "sequence_violation_ref": int(_match_rule(from_sku, to_sku) is not None),
    }


def _clip(value: float) -> float:
    return max(0.0, value)


def _match_rule(from_sku: dict, to_sku: dict) -> dict | None:
    for rule in sorted(rules_payload(), key=_rule_specificity, reverse=True):
        if _rule_matches(rule, from_sku, to_sku):
            return rule
    return None


def _rule_matches(rule: dict, from_sku: dict, to_sku: dict) -> bool:
    checks = [
        ("from_sku_id", from_sku["sku_id"]),
        ("to_sku_id", to_sku["sku_id"]),
        ("from_category", from_sku["category"]),
        ("to_category", to_sku["category"]),
    ]
    for key, actual in checks:
        expected = rule.get(key)
        if expected is not None and expected != actual:
            return False
    if rule.get("from_category_in") is not None and from_sku["category"] not in rule["from_category_in"]:
        return False
    if rule.get("to_category_in") is not None and to_sku["category"] not in rule["to_category_in"]:
        return False
    return True


def _rule_specificity(rule: dict) -> int:
    score = 0
    for key in [
        "from_sku_id",
        "to_sku_id",
        "from_category",
        "to_category",
        "from_category_in",
        "to_category_in",
    ]:
        if rule.get(key) is not None:
            score += 1
    if rule.get("from_sku_id") is not None or rule.get("to_sku_id") is not None:
        score += 10
    return score


def rules_payload() -> list[dict]:
    return [
        {
            "rule_id": "SR-001",
            "rule_version": "rules-2026.05.v1",
            "rule_type": "color_transition",
            "from_sku_id": "SKU-BLACK-001",
            "to_sku_id": "SKU-WHITE-001",
            "from_category": None,
            "to_category": None,
            "from_category_in": None,
            "to_category_in": None,
            "penalty": 10,
            "risk": "high",
            "commit_blocking": False,
            "reason": "검정 이후 흰색 생산은 잔류 안료로 인한 품질 리스크가 가장 높습니다.",
            "recommendation": "흰색 계열을 먼저 생산하거나 중간 세척 단계를 반드시 추가하세요.",
            "note": "SKU 레벨 룰. SR-002보다 구체적이므로 Rule Engine이 먼저 적용합니다.",
        },
        {
            "rule_id": "SR-002",
            "rule_version": "rules-2026.05.v1",
            "rule_type": "color_transition",
            "from_sku_id": None,
            "to_sku_id": None,
            "from_category": "dark",
            "to_category": "light",
            "from_category_in": None,
            "to_category_in": None,
            "penalty": 6,
            "risk": "high",
            "commit_blocking": False,
            "reason": "어두운색(dark) 이후 밝은색(light) 생산은 잔류 안료 리스크가 있습니다.",
            "recommendation": "가능하면 밝은색을 먼저 생산하거나, 세척 강도를 높이세요.",
            "note": "category 레벨 룰. SKU-BLACK→SKU-WHITE는 SR-001이 우선 적용됩니다.",
        },
        {
            "rule_id": "SR-003",
            "rule_version": "rules-2026.05.v1",
            "rule_type": "color_transition",
            "from_sku_id": None,
            "to_sku_id": None,
            "from_category": None,
            "to_category": "mid",
            "from_category_in": ["metal", "special"],
            "to_category_in": None,
            "penalty": 7,
            "risk": "mid",
            "commit_blocking": False,
            "reason": "메탈/특수광택 이후 일반색(mid) 생산은 광택 잔류 리스크가 있습니다.",
            "recommendation": "일반색을 먼저 생산하거나, 세척 시 광택 잔류 여부를 추가 확인하세요.",
            "note": "v1.3 수정: 문서 초안의 to_category='normal'은 sku_master enum에 없음. mid가 실질적 일반색 카테고리이므로 mid로 변경.",
        },
        {
            "rule_id": "SR-004",
            "rule_version": "rules-2026.05.v1",
            "rule_type": "color_transition",
            "from_sku_id": None,
            "to_sku_id": None,
            "from_category": None,
            "to_category": "light",
            "from_category_in": ["metal", "special"],
            "to_category_in": None,
            "penalty": 8,
            "risk": "high",
            "commit_blocking": False,
            "reason": "메탈/특수광택 이후 밝은색(light) 생산은 광택 잔류가 흰색 계열 품질에 직접 영향을 줍니다.",
            "recommendation": "밝은색을 먼저 생산하거나, 메탈 계열 생산 직후 세척을 강화하세요.",
            "note": "SR-003보다 위험. 밝은색은 광택 잔류가 육안으로 확인됩니다.",
        },
    ]


def split_transition_rows(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        grouped[f"{row['from_sku']}|{row['to_sku']}"].append(row)

    rng = random.Random(RANDOM_SEED)
    shuffled_groups = {}
    for pattern, pattern_rows in grouped.items():
        group = pattern_rows.copy()
        rng.shuffle(group)
        shuffled_groups[pattern] = group

    test_counts = {
        pattern: max(1, math.floor(len(pattern_rows) * 0.2))
        for pattern, pattern_rows in shuffled_groups.items()
    }
    remaining = TARGET_TEST - sum(test_counts.values())
    if remaining < 0:
        raise RuntimeError("Target test split is smaller than the per-pattern minimum.")

    for pattern in sorted(shuffled_groups, key=lambda key: (-len(shuffled_groups[key]), key)):
        if remaining == 0:
            break
        if len(shuffled_groups[pattern]) - test_counts[pattern] > 1:
            test_counts[pattern] += 1
            remaining -= 1

    train_rows: list[dict] = []
    test_rows: list[dict] = []
    for pattern in grouped:
        test_count = test_counts[pattern]
        test_rows.extend(shuffled_groups[pattern][:test_count])
        train_rows.extend(shuffled_groups[pattern][test_count:])

    train_rows.sort(key=lambda row: row["transition_id"])
    test_rows.sort(key=lambda row: row["transition_id"])
    if len(train_rows) != TARGET_TRAIN or len(test_rows) != TARGET_TEST:
        raise RuntimeError(
            f"Expected train/test split {TARGET_TRAIN}/{TARGET_TEST}, "
            f"got {len(train_rows)}/{len(test_rows)}"
        )
    return train_rows, test_rows


def generation_report(rows: list[dict], train_rows: list[dict], test_rows: list[dict]) -> str:
    lines = ["=== transition_history 생성 검증 리포트 ===", ""]

    def check(label: str, passed: bool, detail: str = "") -> None:
        mark = "PASS" if passed else "FAIL"
        lines.append(f"  {mark}  {label}")
        if detail:
            lines.append(f"         {detail}")

    check("총 건수 = 1,500", len(rows) == TARGET_TOTAL, f"실제={len(rows)}")

    null_count = sum(
        1
        for row in rows
        for value in row.values()
        if value is None or value == ""
    )
    check("결측값 없음", null_count == 0, f"결측={null_count}건")

    negative_columns = [
        "setup_time",
        "labor_cost",
        "material_loss",
        "wash_cost",
        "packaging_time",
        "downtime",
        "days_since_last_clean",
    ]
    negative_count = sum(
        1
        for row in rows
        for column in negative_columns
        if float(row[column]) < 0
    )
    check("음수값 없음", negative_count == 0, f"음수={negative_count}건")

    violation_rate = _average([float(row["sequence_violation_ref"]) for row in rows]) * 100
    check(
        "violation_ref 비율 15~25%",
        15 <= violation_rate <= 25,
        f"실제={violation_rate:.1f}%",
    )

    sku_map = {sku["sku_id"]: sku for sku in sku_rows()}
    high_rows = [
        row
        for row in rows
        if (rule := _match_rule(sku_map[row["from_sku"]], sku_map[row["to_sku"]]))
        and rule["risk"] == "high"
    ]
    avg_all_wash = _average([float(row["wash_cost"]) for row in rows])
    avg_high_wash = _average([float(row["wash_cost"]) for row in high_rows])
    high_ratio = ((avg_high_wash - avg_all_wash) / avg_all_wash * 100) if avg_all_wash else 0.0
    check(
        "고위험 패턴 wash_cost 평균이 전체보다 30% 이상 높음",
        high_ratio >= 30,
        f"전체평균={avg_all_wash:,.0f}원 / 고위험평균={avg_high_wash:,.0f}원 / 차이={high_ratio:.1f}%",
    )

    avg_setup_high = _average([float(row["setup_time"]) for row in rows if float(row["worker_skill"]) == 0.9])
    avg_setup_low = _average([float(row["setup_time"]) for row in rows if float(row["worker_skill"]) == 0.3])
    check(
        "High 숙련도 setup_time < Low 숙련도 setup_time",
        avg_setup_high < avg_setup_low,
        f"High={avg_setup_high:.2f}분 / Low={avg_setup_low:.2f}분",
    )

    invalid_worker_skill = [row for row in rows if float(row["worker_skill"]) not in {0.3, 0.6, 0.9}]
    check("worker_skill 허용값(0.3/0.6/0.9)만 존재", not invalid_worker_skill, f"위반={len(invalid_worker_skill)}건")

    invalid_equipment = [row for row in rows if float(row["equipment_condition"]) not in {0.3, 0.7, 1.0}]
    check("equipment_condition 허용값(0.3/0.7/1.0)만 존재", not invalid_equipment, f"위반={len(invalid_equipment)}건")

    invalid_shift = [row for row in rows if row["shift"] not in {"day", "night"}]
    check("shift 허용값(day/night)만 존재", not invalid_shift, f"위반={len(invalid_shift)}건")

    invalid_day = [row for row in rows if not 0 <= int(row["day_of_week"]) <= 6]
    check("day_of_week 0~6 범위", not invalid_day, f"위반={len(invalid_day)}건")

    invalid_package = [
        row
        for row in rows
        if row["from_package_size"] not in set(PACKAGE_SIZES)
        or row["to_package_size"] not in set(PACKAGE_SIZES)
    ]
    check("package_size 허용값(1L/4L/18L)만 존재", not invalid_package, f"위반={len(invalid_package)}건")

    train_patterns = {f"{row['from_sku']}|{row['to_sku']}" for row in train_rows}
    test_patterns = {f"{row['from_sku']}|{row['to_sku']}" for row in test_rows}
    only_in_test = test_patterns - train_patterns
    check(
        "모든 패턴이 train에 최소 1건 존재",
        not only_in_test,
        f"train전용={len(train_patterns - test_patterns)} / test전용={len(only_in_test)}",
    )
    check(
        "train/test 분할 = 1,200/300",
        len(train_rows) == TARGET_TRAIN and len(test_rows) == TARGET_TEST,
        f"train={len(train_rows)}건 / test={len(test_rows)}건",
    )

    lines.extend(["", "=== 주요 분포 요약 ===", ""])
    lines.append("  worker_skill별 avg setup_time:")
    for value, label in [(0.3, "Low"), (0.6, "Mid"), (0.9, "High")]:
        avg_setup = _average([float(row["setup_time"]) for row in rows if float(row["worker_skill"]) == value])
        lines.append(f"    {value:.1f}({label}): {avg_setup:.2f}분")

    lines.append("  equipment_condition별 avg wash_cost:")
    for value, label in [(0.3, "Poor"), (0.7, "Normal"), (1.0, "Good")]:
        avg_wash = _average([float(row["wash_cost"]) for row in rows if float(row["equipment_condition"]) == value])
        lines.append(f"    {value:.1f}({label}): {avg_wash:,.0f}원")

    lines.append("  shift별 avg labor_cost:")
    for shift in ["day", "night"]:
        avg_labor = _average([float(row["labor_cost"]) for row in rows if row["shift"] == shift])
        lines.append(f"    {shift}: {avg_labor:,.0f}원")

    violation_count = sum(int(row["sequence_violation_ref"]) for row in rows)
    lines.append(f"  sequence_violation_ref: 0={len(rows) - violation_count}건 / 1={violation_count}건 ({violation_rate:.1f}%)")

    pattern_counts: dict[str, int] = defaultdict(int)
    for row in rows:
        pattern_counts[f"{row['from_sku']}|{row['to_sku']}"] += 1
    counts = list(pattern_counts.values())
    lines.append(f"  패턴별 건수: min={min(counts)} / max={max(counts)} / mean={_average(counts):.1f}")

    return "\n".join(lines) + "\n"


def _average(values: list[float] | list[int]) -> float:
    return sum(values) / len(values) if values else 0.0


def main() -> None:
    sku_fieldnames = [
        "sku_id",
        "sku_name",
        "category",
        "color_family",
        "pigment_intensity",
        "gloss_level",
        "viscosity",
        "hex_code",
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

    transitions = transition_rows()
    train_transitions, test_transitions = split_transition_rows(transitions)

    write_csv(RAW_DIR / "sku_master.csv", sku_fieldnames, sku_rows())
    write_csv(RAW_DIR / "daily_plan.csv", plan_fieldnames, plan_rows())
    write_csv(RAW_DIR / "transition_history.csv", transition_fieldnames, transitions)
    write_csv(RAW_DIR / "transition_history_train.csv", transition_fieldnames, train_transitions)
    write_csv(RAW_DIR / "transition_history_test.csv", transition_fieldnames, test_transitions)
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
    (RAW_DIR / "generation_report.txt").write_text(
        generation_report(transitions, train_transitions, test_transitions),
        encoding="utf-8",
    )
    print(f"Seed data written to {RAW_DIR}")


if __name__ == "__main__":
    main()
