# SmartFactoryV2 backend — Render 무료 Docker 서비스용 경량 이미지.
# 학습된 XGBoost 모델(app/data/models/*.json)이 커밋돼 있으므로 빌드/런타임 학습은 하지 않는다.
FROM python:3.11-slim

# .pyc 미생성 + stdout/stderr 즉시 flush (컨테이너 로그 가시성).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# xgboost 휠은 런타임에 OpenMP(libgomp1)를 요구한다 — 미설치 시 import 단계에서 실패한다.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# pyproject.toml의 [project].dependencies와 동일한 런타임 의존성만 설치한다.
# 패키지 자체(pip install -e .)는 설치하지 않는다 — data/*.json 같은 비-파이썬 리소스
# 누락을 막기 위해 소스를 COPY하고 /app을 CWD로 두어 `app` 패키지를 직접 import 한다.
RUN pip install --no-cache-dir \
    "fastapi>=0.110" \
    "uvicorn[standard]>=0.27" \
    "pydantic>=2.6" \
    "pandas>=2.0" \
    "xgboost>=2.0" \
    "ortools>=9.8" \
    "google-genai>=0.3" \
    "python-dotenv>=1.0"

# 소스 + 커밋된 모델/원천 데이터(app/data/models, app/data/raw) 포함.
COPY app ./app

# 학습은 모델이 이미 커밋돼 있어 불필요하다. 필요 시 아래 두 줄의 주석을 해제해 재학습한다.
# RUN cd /app && python -m app.ml.train_xgboost \
#     # 빌드 시 모델 6개를 app/data/models 아래에 재생성한다.

# Render는 컨테이너가 $PORT로 리슨하길 기대한다. 로컬 단독 실행 시 8000으로 fallback.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
