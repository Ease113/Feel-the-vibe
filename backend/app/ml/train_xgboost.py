from app.ml.model_registry import get_model_path


def main() -> None:
    model_path = get_model_path()
    print(
        "XGBoost training is reserved for the next P0 backend pass. "
        f"Heuristic fallback is active. Expected model path: {model_path}"
    )


if __name__ == "__main__":
    main()
