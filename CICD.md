# CI/CD 가이드

배포 자동화에는 두 경로가 있습니다. **하나만 선택**하세요 — 둘을 동시에 켜면 같은 push에서
중복 배포가 발생합니다.

| | Path A (권장·기본) | Path B |
|---|---|---|
| 배포 트리거 | Render/Cloudflare **네이티브 자동배포**(Git 연동) | **GitHub Actions**(`deploy.yml`) |
| GitHub Actions 역할 | `ci.yml` — 테스트/빌드 **검증만** | `deploy.yml` — 테스트 통과 후 **직접 배포** |
| 테스트가 배포를 막나? | ❌ (플랫폼이 독립적으로 배포) | ✅ (테스트 실패 시 배포 안 됨) |
| 필요한 Secrets | 없음 | 4개(아래) |
| 설정 난이도 | 낮음 | 중간 |

## Path A — 네이티브 자동배포 + `ci.yml` (권장)

플랫폼의 Git 연동 자동배포를 그대로 쓰고, GitHub Actions는 품질 게이트로만 둡니다.

- `render.yaml`의 `autoDeploy: true` → presentation push 시 Render가 자동 재배포.
- Cloudflare Pages를 Git 연동으로 만들면 push 시 자동 빌드/배포.
- `.github/workflows/ci.yml` 이 백엔드 `pytest` + 프론트 `npm run build`를 검증.

> 단점: `ci.yml`이 실패해도 플랫폼 배포는 별도로 진행됩니다(테스트가 배포를 막지 못함).
> 해커톤 데모처럼 빠른 반영이 우선이면 이 경로가 가장 단순합니다.

## Path B — `deploy.yml` + GitHub Secrets

테스트가 통과해야만 배포되도록 GitHub Actions가 배포까지 책임집니다.

`.github/workflows/deploy.yml`:
1. `test` 잡 — 백엔드 `pytest`.
2. `deploy-backend`(needs: test) — Render **Deploy Hook** 호출.
3. `deploy-frontend`(needs: test) — `VITE_API_BASE` 주입 후 빌드 → Cloudflare **wrangler** 업로드.

### 전환 시 반드시 할 것 (중복 배포 방지)
- `render.yaml`의 `autoDeploy` 를 **`false`** 로 변경 → Render 네이티브 자동배포 off.
- Cloudflare Pages는 **Git 연동 대신 Direct Upload**(wrangler) 프로젝트로 만들어 네이티브
  자동배포를 끔.

### 필요한 GitHub Secrets
`Settings > Secrets and variables > Actions`에 등록:

| Secret | 설명 |
|---|---|
| `RENDER_DEPLOY_HOOK` | Render 서비스 Settings의 Deploy Hook URL |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages 편집 권한 API 토큰 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 ID |
| `VITE_API_BASE` | 배포된 백엔드 URL (예: `https://feel-the-vibe-api.onrender.com`) |

> 토큰·키는 **GitHub Secrets로만** 관리합니다. 워크플로 파일이나 리포 어디에도 평문으로
> 남기지 않습니다.

## 선택 기준
- **빠른 데모/단순함 우선** → Path A.
- **테스트 게이트가 꼭 필요(메인 브랜치 보호 등)** → Path B.
