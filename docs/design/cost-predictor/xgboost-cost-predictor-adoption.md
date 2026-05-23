# XGBoost 적용 가이드 설계

> 목적: 사용자가 직접 구현하면서 학습하기 위한 **설계 가이드**. 실제 코드는 작성하지 않음.
> 범위: `backend/app/ml/train_xgboost.py`, `backend/app/services/cost_predictor.py`, `backend/app/ml/model_registry.py`를 중심으로 한 P0 ML 패스.

---

## 1. Context — 왜 지금 적용 가능한가

repo 현재 상태를 점검한 결과, XGBoost 적용에 필요한 스캐폴딩은 이미 갖춰져 있다.

| 항목 | 상태 |
|---|---|
| 학습 데이터 | `transition_history_train.csv` (1200행), `_test.csv` (300행). 6개 target 컬럼 + feature 컬럼 모두 존재 |
| 의존성 선언 | `backend/pyproject.toml`에 `xgboost>=2.0` 명시됨 (venv 미설치 가능성 있음 — 확인 필요) |
| 모델 경로 | `model_registry.get_model_path()` → `backend/app/data/models/xgboost_transition_cost.json` |
| 학습 스크립트 | `train_xgboost.py` 존재하지만 print만 하는 스텁 |
| 추론 경로 | `CostPredictor`는 heuristic만 사용. 모델 로드/예측 경로 없음 |
| Fallback 정책 | AGENTS.md/CLAUDE.md에서 "모델 없으면 heuristic" 명시 — 그대로 따르면 됨 |

따라서 새로 만들 것은 **(a) 학습 파이프라인**, **(b) 추론 시 모델 로드/사용 + fallback** 두 가지뿐이다. 데이터 파이프라인이나 API 계약을 건드릴 필요는 없다.

---

## 2. 설계 원칙

1. **계약 불변**: `CostPredictor.predict_transition()`의 입출력 시그니처는 그대로 유지. 내부 구현만 분기. `optimizer.py`, `services` 어느 곳도 수정하지 않는다.
2. **Fallback이 primary path와 동등**: 모델 로드 실패, 단일 예측 실패, NaN/inf 모두 heuristic으로 떨어진다. fallback은 예외 경로가 아니라 동급 경로다.
3. **6차원 독립 회귀** (권장): `setup_time`, `labor_cost`, `material_loss`, `wash_cost`, `downtime`, `packaging_time` 각각에 대해 `XGBRegressor` 하나씩 → 6개 모델을 묶어 1개 JSON/pkl로 저장. 차원별 feature importance를 보기 쉽고, 일부 차원만 fallback하는 것도 가능.
4. **재현성**: 학습 시 `random_state=42`, train/test split은 이미 분리된 CSV를 그대로 사용. 추가 split 금지.
5. **Heuristic 코드는 살려둔다**: `CostPredictor` 내부에 `_predict_heuristic()`으로 메서드 분리 후, 기존 본문은 그대로 재사용. 모델 경로가 추가될 뿐.

---

## 3. 파일별 작업 가이드

### 3.1 `backend/app/ml/train_xgboost.py` — 학습 파이프라인

**역할**: train CSV → feature/target 추출 → 6개 XGBRegressor 학습 → 단일 파일 저장 → test CSV로 MAE 리포트.

**구현 단계 (의사 흐름)**:

1. `pandas.read_csv`로 `transition_history_train.csv`, `_test.csv` 로드.
2. **Feature 설계**: heuristic이 사용하는 신호와 같은 의미를 가지도록 맞춘다.
   - 수치형: `worker_skill`, `crew_size`, `days_since_last_clean`, `equipment_condition`, `day_of_week`
   - 카테고리: `shift` (day/night) → one-hot 또는 label encoding
   - 전환 특성: `from_sku`, `to_sku`를 `sku_master.csv`와 join해서 `brightness_gap`, `viscosity_gap`, `family_changed (bool)`, `metallic_change (bool)`, `package_changed (bool)` 컬럼을 만든다. heuristic의 입력 신호와 1:1 대응이 핵심.
   - **금지**: 미래 정보 누설 (예: `setup_time`을 다른 target의 feature로 쓰면 안 됨).
3. **Target**: 6개 컬럼 분리. `sequence_violation_ref`는 target이 아니라 rule_engine 영역이므로 학습에서 제외.
4. **모델 학습**: 차원마다
   ```
   model = XGBRegressor(n_estimators=200, max_depth=5, learning_rate=0.08,
                         random_state=42, n_jobs=-1)
   model.fit(X_train, y_train_dim)
   ```
   하이퍼파라미터는 출발점일 뿐. 데모용이므로 튜닝에 시간 쓰지 말 것.
5. **저장 형식 결정** (선택지):
   - 옵션 A: `{dimension: booster.save_raw().hex()}` 형태로 단일 JSON. JSON 한 줄에 모든 모델. 로드 단순.
   - 옵션 B: `joblib.dump({dim: model})` → 단일 pkl. 더 쉬움. **권장.**
   - 저장 경로는 `model_registry.get_model_path()`를 그대로 사용하되 확장자만 결정 (pkl이면 `xgboost_transition_cost.pkl`로 레지스트리 함수 수정).
6. **리포트**: 차원별 MAE를 stdout에 출력하고 `backend/app/data/models/training_report.txt`에 기록. fallback 비교를 위해 heuristic으로도 동일 test 셋을 평가해 같이 출력하면 "왜 XGBoost가 가치 있는지" 시연 근거가 된다.
7. **실행 진입점**: `python -m app.ml.train_xgboost` 또는 `python backend/app/ml/train_xgboost.py`.

**주의**:
- `sku_master` join은 학습/추론 모두에서 동일 코드로 동작해야 한다. 가능하면 **feature 생성 함수**를 `app/ml/features.py`로 분리하고 학습·추론이 둘 다 import. 그렇지 않으면 학습/추론 feature가 어긋난다 (가장 흔한 ML 버그).

### 3.2 `backend/app/ml/model_registry.py` — 경로/로드 헬퍼

**역할**: 모델 파일 경로 제공 + 로드 함수 추가.

**추가할 것**:
- `load_model() -> dict | None`: 파일 존재 + 로드 성공 시 `{dimension: model}` 딕셔너리, 실패 시 `None` 반환. 예외는 안에서 잡아서 로깅하고 None으로 떨어뜨린다. 호출부가 try/except를 쓰지 않아도 되도록.
- 모듈 레벨 캐시(`_MODEL_CACHE`)로 한 번만 로드. `CostPredictor`가 매 요청마다 디스크 IO하면 안 됨.
- `MODEL_VERSION`은 `core/config.py`에 있음. 모델 로드 성공 시 `"xgboost-v1"`처럼 갱신하는 흐름이 필요하다 — 단, 전역 상수를 런타임에 바꾸기보다 `CostPredictor.__init__`에서 인스턴스 속성으로 결정하는 게 깔끔.

### 3.3 `backend/app/services/cost_predictor.py` — 추론 분기

**역할**: 모델이 있으면 XGBoost, 없으면 heuristic. 입출력 시그니처 유지.

**구조 가이드**:

```
class CostPredictor:
    def __init__(self):
        self._models = load_model()          # dict or None
        self.model_version = "xgboost-v1" if self._models else "heuristic-v1"

    def predict_transition(self, from_item, to_item, context):
        if self._models is None:
            return self._predict_heuristic(from_item, to_item, context)
        try:
            return self._predict_xgboost(from_item, to_item, context)
        except Exception as e:
            log.warning("XGBoost predict failed, fallback to heuristic: %s", e)
            return self._predict_heuristic(from_item, to_item, context)
```

**`_predict_xgboost` 핵심**:
1. 같은 feature 생성 함수(`app/ml/features.py`)로 단일 행 DataFrame 또는 numpy 배열 생성.
2. 6개 모델에 각각 `.predict(X)[0]` 호출.
3. heuristic과 동일한 6개 키를 가진 dict 반환. 음수 방지를 위해 `max(0.0, value)` 클램프.
4. round 자리수는 heuristic과 맞춘다 (UI에서 표시 단위 일관성).

**Fallback 단위 결정**:
- 모델 전체 로드 실패 → 인스턴스 단위 heuristic.
- 특정 예측에서 NaN/inf/예외 → 해당 호출만 heuristic으로 떨어뜨림. 부분 fallback (차원별 mix)은 비교 일관성을 해치므로 권장하지 않음.

### 3.4 신규 파일: `backend/app/ml/features.py` (권장)

**역할**: 학습·추론에서 공통으로 쓰는 feature 생성 함수.

**핵심 함수**:
- `build_features_from_history(df, sku_master_df) -> pd.DataFrame`: 학습용. CSV 전체 처리.
- `build_features_for_transition(from_item, to_item, context) -> pd.DataFrame`: 추론용. 단일 행. 둘 다 **같은 컬럼 순서/이름**을 반환해야 한다.

이 함수가 둘 사이의 단일 진실원천(single source of truth). 학습/추론 불일치 버그의 99%는 이걸 안 만들어서 발생.

---

## 3.5 스크립트별 코드 작성 가이드 (의사 구조)

> 실제 코드가 아닌 구조 스케치. 각 함수가 **무엇을 받고 무엇을 돌려주는지**, **순서**, **주의점**만 정리. 사용자가 직접 구현하면서 학습하는 용도.

### A. `backend/app/ml/features.py` (신규)

학습/추론 공통의 feature 변환. 가장 먼저 작성.

```
# 1. 상수 정의
COLOR_FAMILY_ORDER = ["white", "yellow", "red", "blue", "green", "black", ...]
SHIFT_MAP = {"day": 0, "night": 1}
FEATURE_COLUMNS = [
    "brightness_gap", "viscosity_gap", "family_changed", "metallic_change",
    "package_changed", "worker_skill", "crew_size", "days_since_last_clean",
    "equipment_condition", "shift_code", "day_of_week",
]   # 학습/추론 동일 순서로 사용

# 2. 단일 행 feature 추출 (추론용)
def build_features_for_transition(from_item, to_item, context) -> pd.DataFrame:
    # cost_predictor.py 내부 heuristic 함수 (_brightness_level, _viscosity_level,
    # _is_metallic)와 동일한 의미의 값 생성.
    # FEATURE_COLUMNS 순서대로 1xN DataFrame 반환.

# 3. 학습 데이터 변환
def build_features_from_history(history_df, sku_master_df) -> tuple[pd.DataFrame, pd.DataFrame]:
    # history_df의 from_sku/to_sku를 sku_master_df와 두 번 join
    # 위 단일 행 추출과 동일한 컬럼 만들기
    # X = FEATURE_COLUMNS, y = TARGET_COLUMNS 6개
    return X, y
```

**주의**: 단일 행 함수와 배치 함수의 컬럼 순서/이름이 정확히 같아야 한다. 가능하면 단일 행 함수도 내부적으로 dict → DataFrame 한 줄 만든 뒤 `[FEATURE_COLUMNS]`로 리오더링.

### B. `backend/app/ml/train_xgboost.py` (스텁 → 본 구현)

```
def main():
    # 1. 로드
    train_df = pd.read_csv(DATA_RAW_DIR / "transition_history_train.csv")
    test_df  = pd.read_csv(DATA_RAW_DIR / "transition_history_test.csv")
    sku_df   = pd.read_csv(DATA_RAW_DIR / "sku_master.csv")

    # 2. feature 변환 (공통 모듈 사용)
    X_train, y_train = build_features_from_history(train_df, sku_df)
    X_test,  y_test  = build_features_from_history(test_df,  sku_df)

    # 3. 6개 차원 각각 학습
    models = {}
    for dim in TARGET_COLUMNS:           # setup_time, labor_cost, ...
        m = XGBRegressor(n_estimators=200, max_depth=5, learning_rate=0.08,
                          random_state=42, n_jobs=-1)
        m.fit(X_train, y_train[dim])
        models[dim] = m

    # 4. 저장 — joblib 권장
    save_path = get_model_path()         # 확장자 .pkl로 통일
    joblib.dump(models, save_path)

    # 5. 평가 리포트 (선택이지만 시연에 유용)
    for dim, m in models.items():
        pred = m.predict(X_test)
        mae  = mean_absolute_error(y_test[dim], pred)
        # heuristic도 동일 test셋에 돌려 비교 (선택)
        # stdout + training_report.txt 기록

if __name__ == "__main__":
    main()
```

**진입점**: `python -m app.ml.train_xgboost` (backend/ 디렉토리에서).

### C. `backend/app/ml/model_registry.py` (확장)

기존 `get_model_path`는 유지. 다음 두 가지 추가.

```
_MODEL_CACHE: dict | None = None
_LOAD_TRIED = False

def get_model_path() -> Path:
    # 기존 그대로. 단 확장자가 .pkl이면 함수도 .pkl로 반환하도록 수정.

def load_model() -> dict | None:
    """디스크에서 6차원 XGBoost 모델 딕셔너리 로드. 실패 시 None."""
    global _MODEL_CACHE, _LOAD_TRIED
    if _LOAD_TRIED:
        return _MODEL_CACHE
    _LOAD_TRIED = True
    path = get_model_path()
    if not path.exists():
        return None
    try:
        _MODEL_CACHE = joblib.load(path)
        return _MODEL_CACHE
    except Exception as e:
        logging.getLogger(__name__).warning("model load failed: %s", e)
        return None
```

**주의**: 캐시 플래그를 둬서 모델 파일이 없는 경우에도 매번 디스크를 찌르지 않게 한다.

### D. `backend/app/services/cost_predictor.py` (분기 적용)

기존 본문은 `_predict_heuristic`으로 그대로 옮기고, 진입 메서드만 분기.

```
class CostPredictor:
    def __init__(self):
        self._models = load_model()
        self.model_version = "xgboost-v1" if self._models else MODEL_VERSION

    def predict_transition(self, from_item, to_item, context) -> dict[str, float]:
        if self._models is None:
            return self._predict_heuristic(from_item, to_item, context)
        try:
            return self._predict_xgboost(from_item, to_item, context)
        except Exception as e:
            _log.warning("xgb predict failed → heuristic: %s", e)
            return self._predict_heuristic(from_item, to_item, context)

    def _predict_xgboost(self, from_item, to_item, context) -> dict[str, float]:
        X = build_features_for_transition(from_item, to_item, context)
        out = {}
        for dim, model in self._models.items():
            v = float(model.predict(X)[0])
            out[dim] = round(max(0.0, v), 2)   # 음수 클램프 + heuristic과 같은 자리수
        return out

    def _predict_heuristic(self, from_item, to_item, context) -> dict[str, float]:
        # 현재 predict_transition 본문을 그대로 옮긴다 (수정 금지).
```

**보조 함수** `_brightness_level`, `_viscosity_level`, `_is_metallic`은 그대로 유지하되, `features.py`에서도 같은 로직이 필요하므로 둘 중 한 곳을 import하는 형태가 깔끔. 권장은 `features.py`로 옮기고 `cost_predictor.py`가 import하는 방향.

### E. (필요 시) `pyproject.toml` / 환경

- venv에 `xgboost`가 설치되어 있지 않으면 `pip install xgboost joblib scikit-learn` 실행. (joblib은 xgboost와 함께 설치되는 경우가 많지만 명시 권장)
- 설치 변경은 pyproject 의존성 줄을 건드릴 필요 없음 (이미 선언됨). 의존성 명세 vs venv 상태 차이만 확인.

---

## 4. 검증 절차

1. **패키지 확인**: `python -c "import xgboost; print(xgboost.__version__)"` — 현재 venv에 미설치라면 `pip install xgboost`.
2. **학습 실행**: `python backend/app/ml/train_xgboost.py` → 모델 파일과 training_report.txt 생성 확인.
3. **차원별 MAE**: heuristic 대비 XGBoost가 의미 있게 낮은지 확인. 비슷하거나 더 나쁘면 feature 누락 가능성.
4. **단위 동작**: 백엔드 기동 (`uvicorn app.main:app --reload`) → `/health` 200 → seed → `/plans/{id}` → `/optimize` → `/predict` 호출해서 응답 정상.
5. **Fallback 검증**: 모델 파일을 임시로 다른 이름으로 옮긴 뒤 같은 API 호출 → 여전히 응답이 와야 하고 `model_version`이 `heuristic-v1`로 나와야 한다.
6. **테스트**: `cd backend && python -m pytest tests/` — 기존 smoke test가 깨지지 않아야 한다.
7. **린트**: `ruff check app/` — docstring 누락 주의 (CLAUDE.md 규정).

---

## 5. 구현 순서 추천

1. `features.py` 먼저 (가장 핵심, 가장 까다로움).
2. `train_xgboost.py`로 모델 만들고 MAE 리포트 확인.
3. `model_registry.load_model` 추가.
4. `cost_predictor.py`에 분기 적용. heuristic 코드는 메서드로 옮기기만, 로직 수정 금지.
5. smoke test 돌리고 fallback 시나리오까지 손으로 확인.
6. `docs/implementation_log.md`에 한 줄 기록.

---

## 6. 함정 체크리스트

- [ ] 학습 feature와 추론 feature의 컬럼 순서가 같은가?
- [ ] `sku_master` join 키 (`sku_id`)가 학습·추론에서 동일하게 작동하는가?
- [ ] 카테고리 인코딩(`shift` 등)이 학습·추론에서 동일 매핑인가? (LabelEncoder를 따로 만들면 망함 — 고정 dict 권장)
- [ ] 모델 파일이 없을 때 import 자체가 깨지지는 않는가?
- [ ] `predict_transition`이 음수/NaN을 반환할 가능성이 있는가? (있으면 클램프)
- [ ] `model_version` 문자열이 `/decisions` 로그에 들어갈 때 일관적인가?

---

## 7. 범위 밖

- LLM 설명, OR-tools 변경, frontend 변경 모두 이번 패스 대상 아님.
- Hyperparameter 튜닝, cross-validation, early stopping은 데모 안정성에 기여하지 않으므로 후순위.
- `transition_history.csv` (합본)는 사용하지 않음. 이미 분리된 train/test만 쓴다.
