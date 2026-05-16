# AGENTS.md

이 저장소의 프로젝트 이름은 `SmartFactoryV2`입니다. 목적은 다품종 도료 제조 생산순서 의사결정 지원 시스템의 해커톤 MVP를 빠르게 동작시키는 것입니다.

## 운영 원칙

- `docs/roadmap.md`를 구현 우선순위의 기준 문서로 사용합니다.
- `docs/source/DB_state_v1.3.md`의 화면 State, DB, API, MVP 제약을 domain contract로 봅니다.
- 추천/현재/확정 순서는 항상 `plan_item_id[]`입니다. `sku_id[]`를 순서의 primary key로 사용하지 않습니다.
- 비교 기준은 `objectiveScore = totalWeightedCost + sequencePenalty`입니다.
- 시연 가능한 수직 슬라이스를 우선하고, 과설계를 피합니다.
- XGBoost, OR-tools, LLM 계열 기능은 실패해도 전체 API가 깨지지 않도록 fallback을 유지합니다.

## Project Source Documents

Before implementing or modifying core behavior, Codex must inspect the following documents:

1. `docs/roadmap.md`
   - Primary execution roadmap.
   - Use this as the main implementation sequence.
   - P0/P1/P2 priority must follow this file.

2. `docs/source/DB_state_v1.3.md`
   - Primary state, API, DB, and frontend/backend contract reference.
   - Read this before changing API contracts, frontend state, database schema, or sequence evaluation logic.

3. `docs/source/final_proposal.pdf`
   - Original planning/proposal source.
   - Use this only to verify business intent, demo narrative, and project scope.
   - Do not override `docs/roadmap.md` or `docs/source/DB_state_v1.3.md` with vague proposal wording.

4. `docs/source/roadmap.jpeg`
   - Original roadmap image.
   - Treat this as source evidence only.
   - The executable roadmap is `docs/roadmap.md`.

Priority order:
1. `docs/roadmap.md`
2. `docs/source/DB_state_v1.3.md`
3. `docs/source/final_proposal.pdf`
4. `docs/source/roadmap.jpeg`

If documents conflict, follow this order:
- For implementation order: `docs/roadmap.md`
- For state/API/DB details: `docs/source/DB_state_v1.3.md`
- For business/demo intent: `docs/source/final_proposal.pdf`

Future tasks should reference these documents as follows:
- Treat `docs/roadmap.md` as the primary implementation roadmap.
- Treat `docs/source/DB_state_v1.3.md` as the primary state/API/DB contract reference.
- Treat `docs/source/final_proposal.pdf` as the original business/proposal reference.
- Treat `docs/source/roadmap.jpeg` as original evidence only, not the main execution document.

## 구현 우선순위

| 우선순위 | 기준 |
|---|---|
| P0 | 합성 데이터, 비용 예측, 순서 최적화, 순서 검증, 우선순위 profile, SQLite 저장, 기본 KPI |
| P1 | template 설명, KPI 차트, 7차원 비용 추이, 주간 요약, reviewed 표시 |
| P2 | 작업자 뷰, 품질 영향 예측, MES/ERP, 다중 라인, 실시간 설비 로그 |

## fallback 정책

- XGBoost 모델이 없거나 로드되지 않으면 `CostPredictor`의 deterministic heuristic을 사용합니다.
- OR-tools가 없거나 최적화 구성이 실패하면 작은 계획은 brute-force 순열 탐색을 사용합니다.
- LLM 환경변수가 없으면 `ExplanationService`의 template 설명을 사용합니다.
- fallback 사용 이유는 필요한 경우 `docs/implementation_log.md`에 기록합니다.

## 문서 규칙

- 설계 문서와 개발 문서는 한국어로 작성합니다.
- 코드, API 이름, 명령어, 파일 경로는 원문 표기를 유지합니다.
- 큰 기능, API 변경, 데이터 구조 변경 전에는 `docs/design/` 아래 설계 문서를 먼저 작성합니다.
- 구현 중 설계가 바뀌면 코드 수정 전에 관련 문서를 갱신합니다.

## 검증 기준

- 백엔드 변경 후 최소 `GET /health`, seed data 생성, 관련 API smoke test를 확인합니다.
- DB 저장 로직 변경 후 decision save/load와 dashboard 집계를 확인합니다.
- 프론트엔드 변경 후 개발 서버 기동 또는 빌드 가능 여부를 확인합니다.
- 검증을 실행하지 못했으면 최종 보고에 이유와 대체 확인 내용을 남깁니다.
