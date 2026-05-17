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
python -m uvicorn app.main:app --reload --port 8000

# 프론트엔드
cd frontend
npm run dev
```

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
