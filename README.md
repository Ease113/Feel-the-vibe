# SmartFactoryV2 — 다품종 생산순서 최적화 의사결정 지원 시스템

> **2026 스마트 공장 운영 시스템 MVP 개발 해커톤** 참가작  
> 팀명: **타르트포인트** | 주최: 차세대융합기술연구원 메이커스페이스 × DACON

---

## 🏭 프로젝트 소개

다품종 정밀 생산 환경에서는 제품이 전환될 때마다 Setup 시간, 작업자 재배치, 원자재 교체, 설비 세척 등 여러 운영 비용이 복합적으로 발생합니다.

**SmartFactoryV2**는 이 전환 비용과 순서 리스크를 AI가 분석하고, 생산관리자가 최적의 생산순서를 결정할 수 있도록 돕는 **의사결정 지원 플랫폼**입니다.

> *AI는 생산 컨텍스트를 분석해 전환 비용과 운영 효율을 최적화한다.*

---

## 🎯 해결하려는 문제

- 수십~수백 종의 제품을 하나의 라인에서 생산할 때, **어떤 순서로 만들어야 전환 비용이 최소화되는가?**
- 관리자의 경험과 감에 의존하던 생산순서 결정을 **데이터 기반으로** 전환
- 순서 변경 시 발생하는 색상 오염, 세척 리스크 등을 **즉시 경고**

---

## ✨ 핵심 기능

| 기능 | 설명 |
|---|---|
| 🔮 **AI 추천 순서** | OR-Tools 최적화 엔진이 전환 비용 최소 순서를 자동 제안 |
| 💰 **전환 비용 예측** | XGBoost 모델이 제품 간 전환 비용(시간·세척·작업자)을 실시간 예측 |
| ⚠️ **리스크 검증** | 색상 계열 전환 리스크를 soft warning으로 즉시 피드백 |
| 🔄 **순서 비교** | AI 추천 순서와 관리자 조정 순서의 비용 차이를 나란히 비교 |
| 📊 **KPI 대시보드** | 누적 의사결정 로그 기반의 운영 효율 지표 조회 |
| 🗣️ **AI 설명 생성** | 추천 근거를 자연어로 설명 (Gemini API / Claude CLI / template fallback) |

---

## 🏗️ 시스템 구조

```
사용자 (생산관리자)
    │
    ▼
[Frontend - React + Vite]
    │  생산계획 조회 / 순서 조정 / 비용 비교
    ▼
[Backend - FastAPI]
    ├── /optimize  → OR-Tools 최적 순서 계산
    ├── /predict   → XGBoost 전환 비용 예측
    ├── /validate  → 전환 리스크 검증
    ├── /explain   → LLM 자연어 설명 생성
    └── /decisions → SQLite 의사결정 로그 저장
```

---

## 🛠️ 기술 스택

**Backend**
- Python 3.11 / FastAPI / SQLite
- XGBoost (전환 비용 예측 모델)
- OR-Tools (생산순서 최적화) + brute-force fallback

**Frontend**
- React 18 / Vite / TypeScript

**AI / LLM**
- Google Gemini API (primary) → Claude CLI (fallback) → Template (fallback)
- Graceful degradation: API key 없이도 전체 기능 동작

---

## 🚀 빠른 시작

```bash
# 1. 백엔드
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env          # LLM API key 설정 (선택)
python ../scripts/seed_data.py
python -m app.ml.train_xgboost
uvicorn app.main:app --reload --port 8000

# 2. 프론트엔드
cd frontend
npm install && npm run dev
```

백엔드: `http://localhost:8000` | 프론트엔드: `http://localhost:5173` | API 문서: `http://localhost:8000/docs`

---

## 📋 시연 흐름

1. **생산계획 조회** — 오늘의 생산 품목 리스트 확인
2. **AI 추천 순서 생성** — 전환 비용 최소화 순서를 자동 계산
3. **관리자 순서 조정** — 현장 상황에 맞게 순서를 직접 수정
4. **비용·리스크 즉시 비교** — 추천 순서 vs 조정 순서 비용 차이 확인
5. **최종 확정** — 서버 재검증 후 SQLite에 의사결정 기록 저장
6. **KPI 조회** — 대시보드에서 누적 운영 효율 확인

---

## 🏆 대회 결과

**2026 스마트 공장 운영 시스템 MVP 개발 해커톤**

- 참가팀 163팀 중 **온라인 예선 통과 → 오프라인 본선 진출**
- 본선 참가 (2026.05.22, 차세대융합기술연구원 메이커스페이스)
- 제한된 시간 안에 실제 동작하는 MVP를 완성하고 시연한 것에 의의

---

## 📁 저장소 구조

```
.
├── backend/          # FastAPI 서버, ML 모델, SQLite DB
├── frontend/         # React 웹 클라이언트
├── scripts/          # 합성 데이터 생성 스크립트
└── docs/             # API 명세, DB 스키마, 구현 로그
```

---

## 🎬 시연 영상

[![시연 영상](https://img.youtube.com/vi/OXaTJA8sL20/0.jpg)](https://www.youtube.com/watch?v=OXaTJA8sL20)

---

## 👥 팀

**타르트포인트**

| 이름 | 역할 |
|---|---|
| [@Yuan](https://github.com/lee-an-yyy) | 디자인 (UI/UX) / 프론트엔드 |
| [@Ease113](https://github.com/Ease113) | 백엔드 / AI·ML / DB |