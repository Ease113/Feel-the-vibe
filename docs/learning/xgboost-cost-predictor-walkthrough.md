# XGBoost 비용 예측 모델 — 코드 워크스루 + 발표 자료

> 대상: 본 저장소의 backend XGBoost 도입을 처음 보는 사람.
> 목적: 코드를 한 줄씩 따라가며 이해하고, 시연/발표에서 직접 설명할 수 있게 한다.
> 톤: 튜토리얼 + 발표 스크립트.

---

## 1. 우리가 푸는 문제

다품종 도료 공장의 **두 SKU 사이 전환 1건**이 얼마나 비싼지를 미리 알고 싶습니다. 전환 비용은 6개 축으로 구성됩니다.

| 차원 | 의미 | 단위 |
|---|---|---|
| `setup_time` | 라인 셋업 시간 | 분 |
| `labor_cost` | 인건비 | 원 |
| `material_loss` | 잔존 도료 손실 | L |
| `wash_cost` | 세척 비용 | 원 |
| `downtime` | 비가동 시간 | 분 |
| `packaging_time` | 포장 전환 시간 | 분 |

이 값을 미리 알면 OR-tools 최적화기가 **최저 비용 순서**를 골라줍니다. 그래서 핵심 task는 **회귀(regression)** 입니다. "위반 여부" 같은 yes/no 분류가 아니라 "얼마인가"를 숫자로 예측합니다.

> 분류가 아닌 이유: 우리 시스템은 순서를 비교해 `objectiveScore = totalWeightedCost + sequencePenalty`로 줄을 세우는 게 목적입니다. 비용 값 자체가 의사결정의 입력이 되므로 yes/no는 정보 손실이 큽니다.

---

## 2. 왜 XGBoost인가

| 후보 | 평가 |
|---|---|
| 선형 회귀 | 비용은 brightness × shift × equipment_condition 같은 **상호작용**이 강해 선형으로는 fit 부족 |
| Random Forest | 비슷한 tabular 친화도. 단 모델 크기 큼·hyperparameter 직관 부족 |
| Neural net | 1,200행으로는 overfit. 시연 환경 의존성도 늘어남 |
| **XGBoost** | tabular + 1k 행대 + 비선형 상호작용에 가장 잘 맞음. 모델 JSON 한 파일로 배포 가능. 차원별 feature importance가 발표 자료로 그대로 쓸 만함 |

부수 이점:
- 입출력 시그니처가 기존 heuristic과 같아서 `CostPredictor` 내부에서 **plug-in처럼** 갈아끼울 수 있습니다.
- 모델 파일이 없으면 자동으로 heuristic으로 떨어지는 **fallback** 정책을 그대로 유지합니다 (`AGENTS.md`).

---

## 3. 데이터 살펴보기

학습 데이터는 합성된 전환 이력 1,500건입니다.

```
backend/app/data/raw/
  transition_history_train.csv   (1,200행)
  transition_history_test.csv      (300행)
  sku_master.csv                    (11 SKU)
```

`transition_history_*` CSV의 19 컬럼은 두 그룹으로 나뉩니다.

| 그룹 | 컬럼 |
|---|---|
| **메타** | `transition_id`, `transition_date` |
| **feature 후보** | `from_sku`, `to_sku`, `from_package_size`, `to_package_size`, `worker_skill`, `crew_size`, `days_since_last_clean`, `equipment_condition`, `shift`, `day_of_week` |
| **target (6)** | `setup_time`, `labor_cost`, `material_loss`, `wash_cost`, `packaging_time`, `downtime` |
| **이진 라벨** | `sequence_violation_ref` (0/1) — Rule Engine 영역이라 ML target에서 **제외** |

`from_sku`/`to_sku`는 문자열입니다(`"SKU-WHITE-001"`). 그대로는 학습에 못 씁니다. `sku_master.csv`와 join해서 `color_family`, `pigment_intensity`, `gloss_level`, `viscosity`, `category` 같은 **속성**으로 펼쳐야 합니다.

> 시연 포인트: "ML이 잘 동작하려면 데이터를 직접 학습기에 던지는 게 아니라, **도메인 지식이 녹은 신호**로 잘 펴주는 게 70%다." 다음 섹션이 그 작업입니다.

---

## 4. Feature engineering — 도메인 지식을 그대로 ML에 전수

이 프로젝트의 핵심 디자인은 **학습과 추론이 같은 함수를 사용**한다는 점입니다. 그 함수가 `backend/app/ml/features.py`입니다.

```python
# backend/app/ml/features.py:14-30
NUMERIC_CONTEXT_COLUMNS: tuple[str, ...] = (
    "worker_skill", "crew_size", "days_since_last_clean",
    "equipment_condition", "day_of_week",
)
TRANSITION_DERIVED_COLUMNS: tuple[str, ...] = (
    "brightness_gap", "viscosity_gap", "gloss_gap",
    "family_changed", "metallic_change", "package_changed",
)
SHIFT_ONEHOT_COLUMNS: tuple[str, ...] = ("shift_night",)
FEATURE_COLUMNS = NUMERIC_CONTEXT_COLUMNS + SHIFT_ONEHOT_COLUMNS + TRANSITION_DERIVED_COLUMNS
```

12개 컬럼. 그중 6개는 전환 자체에서 만들어집니다.

```python
# backend/app/ml/features.py:79-93
features["brightness_gap"] = (
    ((1.0 - df["from_pigment_intensity"]) * 100.0)
    - ((1.0 - df["to_pigment_intensity"]) * 100.0)
).abs()
features["viscosity_gap"] = (df["from_viscosity"] * 100.0 - df["to_viscosity"] * 100.0).abs()
features["gloss_gap"] = (df["from_gloss_level"] * 100.0 - df["to_gloss_level"] * 100.0).abs()
features["family_changed"] = (df["from_color_family"] != df["to_color_family"]).astype(int)
features["metallic_change"] = (
    df["from_category"].isin(METAL_CATEGORIES) != df["to_category"].isin(METAL_CATEGORIES)
).astype(int)
features["package_changed"] = (df["from_package_size"] != df["to_package_size"]).astype(int)
```

이 식들은 **이미 동작하던 heuristic 예측기와 정확히 같은 신호**입니다. heuristic은 이 신호들을 가중치 합으로 단순 합산했고, XGBoost는 같은 신호로 비선형 트리를 학습합니다. 즉, 우리는 도메인 지식을 한 번만 코딩하고 두 모델이 공유합니다.

### 왜 single source of truth가 중요한가

학습 시 컬럼 순서가 `[brightness_gap, viscosity_gap, ...]`이었는데 추론 때 `[viscosity_gap, brightness_gap, ...]`로 들어가면 XGBoost는 **silent하게 잘못된 가중치를 곱합니다**. 에러도 안 납니다. 그래서 두 경로가 같은 함수를 쓰는 게 필수입니다.

이를 회귀 테스트로 못박아두었습니다.

```python
# backend/tests/test_xgboost.py:78-103
def test_features_build_consistent_shape_train_vs_inference() -> None:
    """학습/추론 feature가 정확히 같은 컬럼·순서를 가지는지 회귀로 보장한다."""
    train_features = build_features_from_history(history_df, sku_df)
    inference_features = build_features_for_transition(from_item, to_item, context)
    assert tuple(train_features.columns) == FEATURE_COLUMNS
    assert tuple(inference_features.columns) == FEATURE_COLUMNS
    assert tuple(train_features.columns) == tuple(inference_features.columns)
```

---

## 5. 학습 코드를 한 줄씩

`backend/app/ml/train_xgboost.py`의 핵심 블록입니다.

### 5.1 하이퍼파라미터 — 의도적으로 평범하게

```python
# backend/app/ml/train_xgboost.py:29-37
HYPERPARAMS: dict[str, Any] = {
    "objective": "reg:squarederror",
    "max_depth": 5,
    "learning_rate": 0.08,
    "verbosity": 0,
    "seed": 42,
    "nthread": -1,
}
NUM_BOOST_ROUND: int = 200
```

| 파라미터 | 의미 | 왜 이 값인가 |
|---|---|---|
| `objective` | 학습 손실함수 | 회귀니까 평균제곱오차 |
| `max_depth=5` | 트리 깊이 | 비선형 상호작용은 잡되 overfit 방지 |
| `learning_rate=0.08` | 한 트리가 기여하는 비율 | 작게 두고 트리 수로 보완 |
| `num_boost_round=200` | 트리 개수 | 1,200행에 충분, 과하지 않음 |
| `seed=42` | 재현성 | 시연 시 같은 숫자 보장 |

> **튜닝 안 한 이유**: 데모/MVP는 절대 정확도보다 **재현성·설명 가능성**이 우선입니다. 발표에서 "n_estimators를 잘 튜닝해서 0.3% 더 좋게 나왔습니다"는 청중에게 의미가 없습니다.

### 5.2 6개 모델 독립 학습

```python
# backend/app/ml/train_xgboost.py:90-103
heuristic_preds = _heuristic_baseline(test_df, sku_df)
dtest = xgb.DMatrix(X_test)
report_lines = ["dimension,mae_xgboost,mae_heuristic,relative_improvement"]
for dim in TARGETS:
    dtrain = xgb.DMatrix(X_train, label=train_df[dim].to_numpy())
    booster = xgb.train(HYPERPARAMS, dtrain, num_boost_round=NUM_BOOST_ROUND)
    booster.save_model(str(model_dir / f"{dim}.json"))

    mae_xgb = _mae(test_df[dim].to_numpy(), booster.predict(dtest))
    mae_heur = _mae(test_df[dim].to_numpy(), heuristic_preds[dim].to_numpy())
    ...
```

**왜 6개를 따로 학습하는가?** Multi-output 회귀 한 모델로도 가능하지만, 차원마다 어떤 feature가 중요한지(예: wash_cost는 family_changed에 강하게 반응, packaging_time은 package_changed에만 반응)를 보고 싶었기 때문입니다. 차원별 booster의 `get_score()`로 feature importance를 따로 볼 수 있습니다.

**왜 `xgb.train()` (low-level)을 쓰고 `XGBRegressor` (sklearn 래퍼)는 안 쓰는가?** `XGBRegressor`는 scikit-learn 의존성을 가져옵니다. 이 프로젝트는 sklearn을 명시 의존성에서 빼는 쪽을 선택했습니다 (MAE 같은 보조 함수는 numpy로 직접 계산).

---

## 6. 모델 저장 / 로드 — XGBoost 네이티브 JSON

저장은 booster 한 개당 한 파일.

```
backend/app/data/models/
  setup_time.json
  labor_cost.json
  material_loss.json
  wash_cost.json
  downtime.json
  packaging_time.json
  training_report.txt
```

각 파일은 ~650KB JSON. pickle/joblib을 안 써서 **버전 portable**합니다.

로드는 `model_registry.load_models()`가 책임집니다.

```python
# backend/app/ml/model_registry.py:88-104
paths = [model_dir / f"{dim}.json" for dim in MODEL_DIMENSIONS]
if not all(path.exists() for path in paths):
    _MODEL_CACHE = None
    _CACHE_SOURCE_DIR = model_dir
    return None

try:
    import xgboost as xgb
    loaded: dict[str, object] = {}
    for dim, path in zip(MODEL_DIMENSIONS, paths):
        booster = xgb.Booster()
        booster.load_model(str(path))
        loaded[dim] = booster
except Exception as exc:
    _log.warning("XGBoost model load failed, falling back to heuristic: %s", exc)
    return None
```

핵심 두 가지:
- **모듈 레벨 캐시**: `Optimizer()`는 매 요청마다 새 `CostPredictor`를 만듭니다. 인스턴스 캐시는 의미가 없어요. 캐시는 모듈 변수 `_MODEL_CACHE`에 두고, 디렉토리 경로 기준으로 무효화합니다.
- **6개 모두 있어야 성공**: 한 개라도 없으면 `None` 반환. 부분 fallback (차원별 mix)은 비교 일관성을 해치니까 안 합니다.

---

## 7. 추론 분기와 fallback — 3단 게이트

`CostPredictor.predict_transition`은 다음 3단계로 동작합니다.

```python
# backend/app/services/cost_predictor.py:55-71
def predict_transition(self, from_item, to_item, context):
    if self._models is None:                                # 1) 모델 없음
        return self._predict_heuristic(from_item, to_item, context)
    try:
        return self._predict_xgboost(from_item, to_item, context)  # 2) 모델 + 정상
    except Exception as exc:
        _log.warning("XGBoost predict failed, falling back to heuristic: %s", exc)
        return self._predict_heuristic(from_item, to_item, context)  # 3) 모델 + 예외
```

3개 경로 **모두 같은 6개 키의 dict를 반환**합니다. 호출자(`SequenceEvaluator`)는 어느 경로로 왔는지 신경 쓰지 않습니다.

### Fallback은 "예외 경로"가 아니라 "동급 경로"

`AGENTS.md`의 fallback 정책 원문은:

> XGBoost 모델이 없거나 로드되지 않으면 `CostPredictor`의 deterministic heuristic을 사용합니다.

데모 환경에서 모델 파일이 빠져도, libomp가 없어 import에서 깨져도, API 전체는 그대로 동작합니다. 시연 도중 모델이 깨질 일은 거의 없지만, 정책상 "모델 없어도 같은 응답 shape"를 약속합니다.

### 모델 버전이 응답으로 흘러나가는 경로

```python
# backend/app/services/cost_predictor.py:31-34
self._models = None if force_heuristic else model_registry.load_models()
self.model_version = (
    self.XGBOOST_VERSION if self._models is not None else self.HEURISTIC_VERSION
)
```

`Optimizer.optimize()`의 응답에 `"model_version"`이 들어가 있고, 그 값은 `self.predictor.model_version`을 그대로 노출합니다. 그래서 프론트엔드는 별도 호출 없이 응답만 보면 어느 모델이 썼는지 알 수 있습니다.

`POST /optimize` 응답 예:

```json
{
  "recommended_sequence": ["PI-001", "PI-005", ...],
  "objective_score": 71797.43,
  "optimizer_backend": "ortools-routing-open-path",
  "model_version": "xgboost-v1",
  "rule_version": "rules-2026.05.v1"
}
```

---

## 8. 평가: XGBoost vs heuristic — `training_report.txt` 읽기

학습 후 자동으로 `backend/app/data/models/training_report.txt`가 생성됩니다.

```
dimension,mae_xgboost,mae_heuristic,relative_improvement
setup_time,2.54,14.06,81.9%
labor_cost,6556.12,29771.06,78.0%
material_loss,0.25,1.38,81.6%
wash_cost,4581.70,18093.25,74.7%
downtime,1.76,4.30,59.1%
packaging_time,1.74,3.05,42.9%
```

### 8.1 컬럼 구조

| 컬럼 | 의미 | 산출식 |
|---|---|---|
| `dimension` | 6개 비용 차원 중 하나 | `MODEL_DIMENSIONS` 상수와 동일 순서 |
| `mae_xgboost` | XGBoost가 **test set 300건**에서 낸 평균 절대 오차 (MAE) | `mean(|y_true − xgb.predict(X_test)|)` |
| `mae_heuristic` | 같은 test set에서 기존 heuristic이 낸 MAE | `mean(|y_true − CostPredictor.heuristic_only().predict(...)|)` |
| `relative_improvement` | heuristic 대비 XGBoost가 얼마나 줄였는지 | `(mae_heuristic − mae_xgboost) / mae_heuristic × 100%` |

세 컬럼이 함께 있어야 의미가 통합니다. `mae_xgboost`만 보면 "2.54는 좋은가 나쁜가"를 판단할 기준이 없고, `relative_improvement`만 보면 "원래 얼마였길래 80% 줄었는가"를 모릅니다.

### 8.2 MAE의 단위와 직관적 해석

MAE는 **예측값과 실제값의 평균 절대 차이**입니다. 단위는 target 자체의 단위를 그대로 따라갑니다.

| dimension | 단위 | XGBoost MAE 의미 |
|---|---|---|
| `setup_time` | 분 | 평균적으로 ±2.54분 틀린다 |
| `labor_cost` | 원 | 평균적으로 ±6,556원 틀린다 |
| `material_loss` | L | 평균적으로 ±0.25L 틀린다 |
| `wash_cost` | 원 | 평균적으로 ±4,582원 틀린다 |
| `downtime` | 분 | 평균적으로 ±1.76분 틀린다 |
| `packaging_time` | 분 | 평균적으로 ±1.74분 틀린다 |

> **주의**: MAE는 부호를 잃습니다. "5,000원 과소 추정"인지 "5,000원 과대 추정"인지는 알 수 없습니다. 부호까지 보고 싶으면 ME(Mean Error)나 잔차 히스토그램이 필요합니다. demo 자료에는 굳이 추가하지 않았습니다.
>
> **주의 2**: MAE는 outlier에 강하고 RMSE보다 직관적입니다. "MAE 6,556원"은 "평균적으로 6,556원 차이 난다"고 그대로 발표할 수 있어 청중에게 설명이 쉽습니다.

### 8.3 절대 vs 상대 — 어느 쪽을 발표에 강조할까

발표 청중에 따라 강조점이 다릅니다.

| 청중 | 권장 강조 | 이유 |
|---|---|---|
| 도메인 전문가(공정 관리자) | **절대 MAE** | "6,556원 오차가 시연 환경에서 허용 가능한가?"가 판단 기준. 상대 % 는 관심 밖. |
| 경영진/심사위원 | **상대 개선율** | "78% 개선"이 강한 헤드라인. 단 숫자만 던지면 base가 약했던 게 아닌지 의심 받을 수 있어 **base인 heuristic MAE를 함께** 보여줘야 함. |
| ML 엔지니어 | **두 값 + 차원별 비교** | 어느 차원이 잘 fit 됐고 어느 차원이 어려운지를 봅니다. |

> 안전한 화법: "heuristic은 평균 약 3만원 틀렸는데, XGBoost는 약 6.6천원으로 줄었습니다. 약 78% 개선입니다." — 절대값을 먼저, 비율을 뒤에. 이렇게 하면 base 의심을 차단할 수 있습니다.

### 8.4 차원별 강·약 패턴 읽기

이번 결과의 **순서 패턴**을 그대로 발표해도 됩니다.

| 패턴 | 차원 | 해석 |
|---|---|---|
| 매우 잘 fit (80%+) | `setup_time`, `material_loss`, `labor_cost` | 합성 데이터에서 noise가 작고, feature(brightness_gap, family_changed 등)와 target이 거의 결정론적으로 연결돼 있음. XGBoost가 그 결정성을 쉽게 학습. |
| 중간 (70%대) | `wash_cost` | family_changed/gloss_gap이 영향을 강하게 주지만 noise term이 함께 들어가 있어 완전 결정론은 아님. |
| 보통 (40~60%) | `downtime`, `packaging_time` | base 값(`max(3.0, ...)`, `5.0 + ...`)이 낮아 절대 MAE의 변화 폭이 작고, noise 비중이 상대적으로 큼. 그래도 모든 차원에서 XGBoost가 더 좋음. |

발표용 한 줄 요약: **"6개 차원 전부 개선됐고, 절대 단위가 큰 비용(labor_cost, wash_cost)에서 절대 MAE 축소가 두드러집니다."**

### 8.5 만약 어느 차원에서 XGBoost가 나쁘게 나오면

이번 결과는 모두 양수 `relative_improvement`이지만, 학습 데이터가 바뀌거나 feature가 빠지면 음수가 나올 수 있습니다. 그때 해석/대응:

| 신호 | 가능한 원인 | 대응 |
|---|---|---|
| 한 차원만 음수 (-10% 등) | 해당 target의 noise가 압도적이거나, target과 feature 관계가 비선형/주기적이라 트리가 capture 못 함 | 차원별 hyperparameter 분리, `max_depth` 또는 `num_boost_round` 조정 |
| 여러 차원이 음수 | 학습/추론 feature drift 가능성 | `tests/test_xgboost.py::test_features_build_consistent_shape_train_vs_inference`가 잡아주지만, 그 외 sku_master 변경이 학습 시점과 일치하는지 확인 |
| `mae_xgboost`만 비정상적으로 크게(예: ×10) 나옴 | train set과 test set이 같은 split 기준이 아닐 가능성 | `transition_history_train.csv` / `_test.csv`가 분리된 그대로인지, `seed_data.py` 변경이 없었는지 확인 |

**규칙**: 음수가 나오면 그 차원의 결과를 **삭제하지 말고 그대로 발표 자료에 노출**합니다. 일부 차원에서만 약한 모델인 게 ML의 일반 패턴이고, "전부 좋다"는 슬라이드는 오히려 의심을 부릅니다.

### 8.6 발표 슬라이드 한 장 예시 (그대로 복붙 가능)

```text
[제목]   XGBoost 비용 예측기 — 학습 결과
[부제]   동일 test set 300건, MAE 비교

  dimension         heuristic    XGBoost    개선율
  ---------------   ----------   --------   --------
  setup_time           14.06분     2.54분    -81.9%
  labor_cost        29,771원     6,556원    -78.0%
  material_loss        1.38L      0.25L     -81.6%
  wash_cost         18,093원     4,582원    -74.7%
  downtime              4.30분    1.76분    -59.1%
  packaging_time        3.05분    1.74분    -42.9%

→ 6개 차원 전부 개선. 절대 단위가 큰 labor/wash에서 축소 폭이 가장 큼.
→ Heuristic은 도메인 지식의 선형 합, XGBoost는 그 위의 비선형 상호작용을 학습.
```

### 8.7 발표 시 자주 받는 후속 질문에 미리 답하기

| 질문 | 짧은 답 |
|---|---|
| "test set 300건은 너무 적지 않나요?" | 합성 데이터라 distribution이 균일하고, train 1,200 vs test 300 비율은 4:1로 표준적입니다. 실 데이터로 옮길 때 추가 검증이 필요합니다. |
| "왜 RMSE가 아니라 MAE인가요?" | 청중 설명 용이성 때문입니다. MAE는 원/분 단위 그대로 해석 가능합니다. RMSE는 큰 오차를 더 강하게 페널티하지만 발표에서는 직관이 떨어집니다. |
| "heuristic도 학습된 건가요?" | 아니요. heuristic은 도메인 지식 기반 deterministic 식입니다. 학습 데이터를 본 적이 없어서 test set에 대해 같은 출력을 냅니다. 이게 XGBoost의 기준선(baseline)으로 적합한 이유입니다. |
| "이 개선율이 운영 비용으로 환산하면 얼마인가요?" | 평균 6,556원 / 전환 1회. 일일 전환이 10건이라면 일당 약 65,560원, 월 약 200만원 수준 (단순 곱셈, 실제 효과는 OR-tools가 선택한 순서가 어떻게 바뀌는가에 따라 달라집니다). |

> 발표 포인트: "heuristic은 도메인 지식의 **선형 합**입니다. XGBoost는 그 위에서 **상호작용**을 학습합니다. 예: `equipment_condition`이 낮을 때 `family_changed`가 켜지면 비용이 비선형으로 튄다는 걸 트리가 잡아냅니다."

---

## 9. 3분 발표 스크립트

### 흐름

| 시간 | 슬라이드/말 |
|---:|---|
| 0:00 | "다품종 도료 공장에서 두 SKU 사이 **전환 비용**을 미리 알아야 OR-tools가 최적 순서를 골라줍니다. 6가지 비용을 회귀로 예측합니다." |
| 0:30 | (표) `setup_time, labor_cost, material_loss, wash_cost, downtime, packaging_time`. "1,200건 합성 이력을 학습 데이터로 사용했습니다." |
| 1:00 | "Feature는 12개. context 5개 + shift 원핫 + 전환 파생 6개. **학습과 추론이 같은 함수**를 호출해서 column drift를 원천 차단합니다." |
| 1:30 | (코드) `xgb.train(..., num_boost_round=200, max_depth=5, learning_rate=0.08)` 6번. "차원마다 booster 하나씩, JSON 한 파일씩." |
| 2:00 | (표) `mae_xgboost vs mae_heuristic` 결과. "모든 차원에서 42~82% 개선. labor_cost는 평균 오차가 2.97만원 → 6.6천원으로 줄었습니다." |
| 2:30 | "운영 시 모델 파일이 없으면 자동으로 heuristic으로 떨어집니다. API 응답 모양은 그대로. `model_version` 필드가 어느 경로로 갔는지 알려줍니다." |
| 3:00 | (마무리) "도메인 지식은 heuristic에 한 번만 쓰고, 같은 신호를 XGBoost가 비선형으로 다시 학습합니다. 둘이 한 입력 시그니처로 plug-in 됩니다." |

### 예상 질문 4개와 답변

**Q1. 1,200행으로 충분한가요?**
> 차원별 MAE가 test set 기준으로 안정적이고, train/test split이 별도 CSV로 명확히 분리되어 있습니다. 차원별 `max_depth=5`로 capacity를 제한해 overfit 신호도 관찰되지 않았습니다. 실 데이터로 옮길 때 hyperparameter는 다시 잡아야 합니다.

**Q2. 왜 sklearn을 안 쓰고 xgboost 저수준 API를?**
> sklearn은 의존성 크기가 큽니다. 이 프로젝트는 fallback 정책상 "scikit-learn 없이도 동작" 옵션을 유지하고 싶었고, MAE 같은 보조 함수는 numpy로 충분합니다. `xgb.train()` + `xgb.DMatrix()` + `Booster.save_model()`로 끝납니다.

**Q3. 모델이 깨지면 어떻게 되나요?**
> `model_registry.load_models()`가 `None`을 반환하고 `CostPredictor`가 heuristic으로 떨어집니다. 단일 예측에서 예외가 나도 그 호출만 heuristic으로 떨어집니다. API 응답 shape는 동일하고, `model_version: heuristic-v1`로 표시돼 운영자가 즉시 식별할 수 있습니다.

**Q4. Heuristic이 이미 잘 동작했는데 XGBoost가 필요한가요?**
> Heuristic은 "도메인 지식 한 번 코딩 + 안정성 보장"이라는 역할로 남습니다. XGBoost는 그 위에서 **상호작용 효과**를 잡습니다. 시연 환경에서는 둘 다 살아 있고, demo에서는 정확도 차이를 같은 test set에서 직접 보여줍니다 (training_report.txt).

---

## 10. 한계와 후속 작업

| 한계 | 영향 | 후속 |
|---|---|---|
| 단일 라인(`LINE-01`) 가정 | 다중 라인 최적화 불가 | P2 |
| 1,200건 합성 데이터 | 실 데이터 distribution shift 시 재학습 필요 | 실 MES 데이터 수집 후 |
| Hyperparameter 튜닝 안 함 | 데모 정확도는 충분, 실 데이터에서 추가 작업 필요 | 데이터 확보 후 |
| `sequence_violation_ref` (0/1) 미사용 | 규칙 위반 신호를 ML target으로 안 씀 — Rule Engine 영역 | 의도된 분리 |
| Feature importance UI 미노출 | 발표 자료에는 있지만 운영 화면엔 없음 | P2 |

---

## 11. 빠른 참조 — 실행/검증 한 줄

```bash
# 학습
cd backend && python -m app.ml.train_xgboost

# 단위 테스트
cd backend && python -m pytest tests/ -q

# end-to-end smoke
cd backend && python -c "
from fastapi.testclient import TestClient; from app.main import app
c = TestClient(app)
plan = c.get('/plans/demo-plan-001').json()
ids = [it['plan_item_id'] for it in plan['plan_items']]
r = c.post('/optimize', json={'plan_id':'demo-plan-001','plan_item_ids':ids,'priority_profile':{}}).json()
print(r['model_version'], r['objective_score'])"
# 기대: xgboost-v1 <number>
```

이 문서는 코드 변경 시 같이 갱신해주세요. 코드 인용에는 `file_path:line_number`를 붙여 두었으니 IDE에서 바로 점프할 수 있습니다.
