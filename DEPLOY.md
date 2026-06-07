# 배포 가이드 (완전 무료)

SmartFactoryV2를 무료 인프라에 올리는 절차입니다. 백엔드는 **Render 무료 Docker 서비스**,
프론트엔드는 **Cloudflare Pages**에 배포합니다.

## 아키텍처

```
[브라우저]
   │  https
   ▼
[Cloudflare Pages]  ── React+Vite 정적 빌드(dist/) ──┐
   │  fetch(VITE_API_BASE)                            │ CORS 허용 필요
   ▼                                                  │
[Render 무료 Docker]  ── FastAPI + 커밋된 XGBoost 모델 ◄┘
   │
   ▼
[SQLite]  ── 컨테이너 임시 디스크(휘발성)
```

- 백엔드 이미지는 학습된 모델(`backend/app/data/models/*.json`)을 그대로 포함합니다.
  **빌드·런타임 학습 없음** → 이미지 경량, 기동 빠름.
- Render 무료 인스턴스는 512MB / 0.1 vCPU. 추론 + OR-Tools 계산만 수행하므로 한도 내입니다.

## 배포 순서 (반드시 이 순서로)

CORS와 API URL이 서로를 참조하므로 **백엔드 먼저** 올리고, 프론트에 백엔드 URL을 주입한 뒤,
마지막에 백엔드 CORS에 프론트 URL을 넣어 양쪽을 연결합니다.

1. **백엔드(Render) 배포** → 서비스 URL 확보 (예: `https://feel-the-vibe-api.onrender.com`)
2. **프론트(Cloudflare Pages) 배포** → 빌드 시 `VITE_API_BASE`에 위 백엔드 URL 주입
   → 프론트 URL 확보 (예: `https://feel-the-vibe.pages.dev`)
3. **백엔드 CORS 교차 입력** → Render 환경변수 `SMARTFACTORY_CORS_ORIGINS`에 프론트 URL 입력 후
   재배포

## 1단계 — 백엔드 (Render)

`render.yaml` Blueprint를 사용합니다.

1. [Render 대시보드](https://dashboard.render.com) → **New > Blueprint** → 이 리포 연결.
2. `render.yaml`이 자동 인식됩니다(`feel-the-vibe-api`, Docker, free, Singapore).
3. **Environment** 탭에서 다음 값을 입력(`sync:false`라 대시보드 입력 필수):
   - `SMARTFACTORY_CORS_ORIGINS` — 3단계에서 프론트 URL 확보 후 입력(지금은 비워두거나 임시값).
   - `SMARTFACTORY_LLM_API_KEY` — Gemini 키. 미입력 시 LLM은 fallback으로 동작(아래 참고).
4. 첫 배포 완료 후 `https://<service>.onrender.com/health` 가 `{"status":"ok",...}` 인지 확인.

## 2단계 — 프론트엔드 (Cloudflare Pages)

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages > Create > Pages**
   → Git 연동(또는 Path B의 Direct Upload).
2. 빌드 설정:
   - Framework preset: **None** (⚠️ "Vite" 프리셋은 선택하지 말 것 — 아래 주의 참고)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `frontend`

   > **왜 "None"인가:** Cloudflare의 "Vite" 프리셋 자동 구성은 **Vite 6.0.0+**를 요구합니다.
   > 이 프로젝트는 Vite 5.x라 프리셋을 고르면
   > `The version of Vite used in the project cannot be automatically configured` 에러가 납니다.
   > Pages는 정적 `dist/`를 서빙할 뿐이라 Vite 버전과 무관하므로, 프리셋을 **None**으로 두고
   > 빌드 명령/출력 폴더만 수동 지정하면 그대로 동작합니다. (프리셋을 꼭 쓰려면 Vite를 6으로
   > 올려야 하며, 이 경우 빌드 재검증이 필요합니다.)
3. **환경변수**에 `VITE_API_BASE = https://<service>.onrender.com` (1단계 백엔드 URL) 입력.
   > Vite는 빌드 타임에 `import.meta.env.VITE_API_BASE`를 인라인합니다 — 값 변경 시 **재빌드** 필요.
4. 배포 후 프론트 URL 확보.

## 3단계 — 양쪽 교차 연결

1. Render → `SMARTFACTORY_CORS_ORIGINS`에 2단계 프론트 URL 입력(콤마로 여러 출처 가능).
2. Render 재배포(Manual Deploy 또는 환경변수 저장 시 자동).
3. 프론트에서 실제 데이터 로드/저장이 동작하는지 확인.

## 환경변수 표

| 위치 | 변수 | 예시 | 설명 |
|---|---|---|---|
| Render(백엔드) | `SMARTFACTORY_CORS_ORIGINS` | `https://feel-the-vibe.pages.dev` | 허용 출처(콤마 구분). 미설정 시 localhost만 |
| Render(백엔드) | `SMARTFACTORY_LLM_API_KEY` | `AIza...` | Gemini 키. 미설정 시 LLM fallback |
| Cloudflare(프론트) | `VITE_API_BASE` | `https://feel-the-vibe-api.onrender.com` | 백엔드 베이스 URL(빌드 타임 주입) |

> 모든 비밀값은 **대시보드/시크릿으로만** 관리합니다. 어떤 파일에도 평문으로 커밋하지 않습니다.

## 운영 주의사항

### 콜드 스타트 (무료 플랜)
Render 무료 서비스는 **15분 무요청 시 sleep**합니다. 다음 요청 시 컨테이너를 깨우느라
수십 초 지연이 생길 수 있습니다. 시연 직전 미리 `/health`를 한 번 호출해 깨워두세요.

**keep-alive 핑(선택):** 외부 모니터(예: cron-job.org, UptimeRobot)로 5~10분마다
`GET /health`를 호출하면 sleep을 방지할 수 있습니다. 단, 무료 시간 한도를 소모하므로
시연 기간에만 켜는 것을 권장합니다.

### SQLite 휘발성
SQLite는 컨테이너 임시 디스크에 저장됩니다. **재배포·sleep·재시작 시 데이터가 초기화**될 수
있습니다(스키마는 기동 시 자동 생성). 의사결정 로그/대시보드 집계는 데모용 휘발 데이터로
간주하세요. 영속이 필요하면 외부 DB(예: 무료 Postgres)로 분리해야 합니다.

### LLM fallback
LLM 호출은 `Gemini API → claude CLI → template` 순으로 graceful degradation 합니다.
배포 환경에 `SMARTFACTORY_LLM_API_KEY`만 설정하면 Gemini를 사용하고, 없으면 template 설명으로
동작합니다(API는 정상). LLM 호출은 명시적 프론트 버튼/별도 endpoint에서만 발생합니다.

### 무료 커스텀 도메인 (선택)
`*.onrender.com` / `*.pages.dev` 기본 도메인으로 충분합니다. 더 깔끔한 주소를 원하면
무료 서브도메인 서비스를 사용하세요:
- [is-a.dev](https://is-a.dev) — 개발자용 무료 서브도메인
- [js.org](https://js.org) — JS 프로젝트용 무료 서브도메인
- ⚠️ **Freenom(.tk/.ml 등)은 사용 금지** — 회수/탈취 이슈로 신뢰할 수 없습니다.

## CI/CD
배포 자동화 경로(네이티브 자동배포 vs GitHub Actions)는 [`CICD.md`](./CICD.md)를 참고하세요.
