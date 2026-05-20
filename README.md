# SmartFactoryV2

SmartFactoryV2는 해커톤 MVP용 다품종 도료 제조 생산순서 의사결정 지원 시스템입니다. 목표는 생산 계획을 불러오고, AI 추천 순서를 만든 뒤, 사용자가 순서를 조정했을 때 전환 비용과 리스크를 즉시 비교하고 최종 확정 로그를 SQLite에 저장하는 수직 슬라이스를 빠르게 시연하는 것입니다.

## MVP 범위

| 우선순위 | 포함 범위 |
|---|---|
| P0 | 합성 데이터, 전환 비용 예측 fallback, OR-tools 코드 경로와 brute-force fallback, 순서 검증, SQLite 의사결정 로그, 기본 KPI 조회 |
| P1 | template 기반 설명, KPI 차트, 주간 요약, reviewed 토글 |
| P2 | 작업자 뷰, 품질 영향 예측, MES/ERP 연동, 다중 라인 최적화, 실시간 설비 로그 |

## 저장소 구조

```text
.
├── docs/
│   ├── source/
│   ├── roadmap.md
│   ├── api_contract.md
│   ├── db_schema.md
│   ├── data_schema.md
│   ├── demo_flow.md
│   └── implementation_log.md
├── backend/
│   ├── app/
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   └── package.json
└── scripts/
    └── seed_data.py
```

## 백엔드 실행

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
python ../scripts/seed_data.py        # 1) 합성 데이터 생성
python -m app.ml.train_xgboost        # 2) XGBoost 모델 6개 학습 (서버 기동 전 1회)
uvicorn app.main:app --reload --port 8000   # 3) 서버 기동
```

`python -m app.ml.train_xgboost`는 `backend/app/data/models/{6 dim}.json` 파일을 생성합니다. 이 파일이 없으면 `CostPredictor`가 자동으로 heuristic으로 fallback 합니다(API는 정상 동작, 단 `model_version`이 `"heuristic-v1"`로 표시됨). XGBoost 경로로 시연하려면 반드시 서버 기동 전에 학습을 1회 실행해야 합니다. macOS에서는 `brew install libomp`가 사전 요구사항입니다.

만약 `uvicorn` 명령이 PATH에 없다면 다음 명령을 사용합니다.

```bash
python -m uvicorn app.main:app --reload --port 8000
```

확인:

```bash
curl http://localhost:8000/health
```

## 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

기본 개발 서버는 `http://localhost:5173`입니다.

## 시연 흐름

1. Decision 화면에서 `GET /plans/demo-plan-001`로 오늘 생산계획을 불러옵니다.
2. `POST /optimize`로 추천 순서를 생성하고 추천 기준선을 보존합니다.
3. 사용자는 현재 순서를 조정하고 `POST /predict`로 비용/리스크를 재계산합니다.
4. `POST /validate`는 색상 전환 리스크를 soft warning으로 반환합니다.
5. 최종 확정 시 `POST /decisions`가 서버 기준으로 재계산한 뒤 SQLite에 저장합니다.
6. Dashboard 화면은 `GET /dashboard`로 저장 로그 기반 KPI를 조회합니다.

## 현재 상태

초기화 단계에서는 전체 MVP를 완성하지 않고, 실행 가능한 모노레포 구조와 fallback-safe 백엔드/프론트엔드 골격을 제공합니다. XGBoost와 OR-tools는 선택 의존성처럼 다루며, 설치 또는 로드 실패 시 deterministic heuristic과 brute-force fallback으로 API가 계속 동작합니다.

## 알려진 제한

- Decision 화면은 아직 Drag & Drop이 아니라 API 연결과 계획 카드 표시만 확인합니다.
- XGBoost 학습은 오프라인 배치입니다(`python -m app.ml.train_xgboost`). 서버 기동 시 자동 학습은 되지 않으며, 모델 파일이 없으면 heuristic으로 자동 fallback 합니다. 자세한 설명·MAE 해석·발표 자료는 [`docs/learning/xgboost-cost-predictor-walkthrough.md`](docs/learning/xgboost-cost-predictor-walkthrough.md) 참고.
- OR-tools 설치 여부는 확인하지만, demo size 5에서는 brute-force fallback으로 최적 순서를 계산합니다.
- `npm install` 결과 2건의 moderate npm audit warning이 있습니다. 초기 MVP 동작에는 영향이 없으며, 패키지 업그레이드는 별도 작업으로 검토합니다.
