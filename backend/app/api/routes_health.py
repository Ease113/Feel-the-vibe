"""헬스체크 라우터."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """서비스 상태를 확인한다. 프론트엔드 기동 시 백엔드 연결 확인에 사용된다."""
    return {"status": "ok", "service": "SmartFactoryV2"}
