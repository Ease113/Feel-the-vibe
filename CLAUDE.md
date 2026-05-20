@AGENTS.md

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 백엔드 | Python 3.11+, FastAPI, SQLite, Pydantic v2 |
| AI/최적화 | XGBoost (optional, heuristic fallback), OR-tools (optional, brute-force fallback) |
| 프론트엔드 | React 18, Vite, dnd-kit, Recharts |
| 데이터 | CSV/JSON 합성 데이터, SQLite 의사결정 로그 |

## 개발 서버

```bash
# 백엔드 (venv 활성화 후)
cd backend
python -m app.ml.train_xgboost              # 서버 기동 전 1회, 모델 6개 생성. 미실행 시 heuristic fallback
python -m uvicorn app.main:app --reload --port 8000

# 프론트엔드
cd frontend
npm run dev
```

XGBoost 학습은 오프라인 배치이며 서버 기동 시 자동 실행되지 않습니다. 모델 파일이 없거나 로드 실패 시 `CostPredictor`가 heuristic으로 자동 fallback 합니다(API 정상, `model_version`만 `heuristic-v1`로 표시). macOS는 `brew install libomp` 사전 요구사항. 자세한 내용은 `docs/learning/xgboost-cost-predictor-walkthrough.md` 참고.

## 테스트

```bash
cd backend
python -m pytest tests/
```

smoke test 확인 순서: `GET /health` → seed data → `/plans` → `/optimize` → `/predict` → `/decisions` → `/dashboard`

## 핵심 제약

- 순서 key는 항상 `plan_item_id[]`입니다. `sku_id[]`를 순서의 primary key로 사용하지 않습니다.
- 비교 기준은 `objectiveScore = totalWeightedCost + sequencePenalty`입니다.
- XGBoost, OR-tools, LLM은 실패해도 API 전체가 깨지지 않도록 fallback을 유지합니다.

## 도메인 계약 문서 우선순위

1. `docs/roadmap.md` — 구현 순서
2. `docs/source/DB_state_v1.3.md` — state/API/DB 계약
3. `docs/source/final_proposal.pdf` — 비즈니스/데모 의도

## 설계 문서

기능 설계 문서는 `docs/design/<feature-name>.md`에 작성합니다.  
섹션 규칙과 문체는 `docs/design/design-doc.md`를 따릅니다.

## 코드 품질

### Docstring / JSDoc 규칙

- 백엔드 공개 함수·클래스에는 Google 스타일 docstring을 작성합니다.
- 프론트엔드 export 함수·컴포넌트에는 JSDoc을 작성합니다.
- 단순 getter나 자명한 1줄 함수는 생략 가능합니다.
- 린트(`ruff`, `eslint`)가 누락 시 에러로 처리합니다.

### 린트 실행

```bash
# 백엔드 (venv 활성화 후)
cd backend && ruff check app/

# 프론트엔드
cd frontend && npm run lint
```
