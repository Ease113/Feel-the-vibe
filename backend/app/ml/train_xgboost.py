"""XGBoost 전환 비용 예측 모델 학습 스크립트 (P1 구현 예정)."""

from app.ml.model_registry import get_model_path


def main() -> None:
    """학습 경로를 출력하고 종료한다. 실제 학습 로직은 P1 백엔드 패스에서 구현된다."""
    model_path = get_model_path()
    print(
        "XGBoost training is reserved for the next P0 backend pass. "
        f"Heuristic fallback is active. Expected model path: {model_path}"
    )


if __name__ == "__main__":
    main()
